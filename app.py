from flask import Flask, render_template, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text

app = Flask(__name__, template_folder='.')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///euro2016.db'
db = SQLAlchemy(app)

# Definição dos grupos da Euro 2016
GROUPS = {
    'A': ['França', 'Romênia', 'Albânia', 'Suíça'],
    'B': ['Inglaterra', 'Rússia', 'País de Gales', 'Eslováquia'],
    'C': ['Alemanha', 'Ucrânia', 'Polônia', 'Irlanda do Norte'],
    'D': ['Espanha', 'República Tcheca', 'Turquia', 'Croácia'],
    'E': ['Bélgica', 'Itália', 'República da Irlanda', 'Suécia'],
    'F': ['Portugal', 'Islândia', 'Áustria', 'Hungria']
}

class Team(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), unique=True, nullable=False)
    group = db.Column(db.String(1), nullable=False)
    points = db.Column(db.Integer, default=0)
    goals_for = db.Column(db.Integer, default=0)
    goals_against = db.Column(db.Integer, default=0)
    matches_played = db.Column(db.Integer, default=0)

    @property
    def goal_difference(self):
        return self.goals_for - self.goals_against

class Match(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    team1_id = db.Column(db.Integer, db.ForeignKey('team.id'), nullable=False)
    team2_id = db.Column(db.Integer, db.ForeignKey('team.id'), nullable=False)
    team1_goals = db.Column(db.Integer, default=None)
    team2_goals = db.Column(db.Integer, default=None)
    round = db.Column(db.String(20), nullable=False)  # 'group' ou 'knockout'
    group = db.Column(db.String(1))
    matchday = db.Column(db.Integer)

class KnockoutMatch(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    stage = db.Column(db.String(10), nullable=False)  # R16, QF, SF, F
    slot = db.Column(db.Integer, nullable=False)      # 1..8 (R16), 1..4 (QF), 1..2 (SF), 1 (F)
    team1_id = db.Column(db.Integer, db.ForeignKey('team.id'))
    team2_id = db.Column(db.Integer, db.ForeignKey('team.id'))
    team1_goals = db.Column(db.Integer)
    team2_goals = db.Column(db.Integer)
    # Gols na prorrogação (após 90 min). Só contam se 90'=empate
    et1 = db.Column(db.Integer)
    et2 = db.Column(db.Integer)
    pen1 = db.Column(db.Integer)
    pen2 = db.Column(db.Integer)
    next_stage = db.Column(db.String(10))
    next_slot = db.Column(db.Integer)
    next_side = db.Column(db.String(5))  # 'team1' ou 'team2'

def ensure_knockout_schema():
    # Migração leve: adiciona colunas et1/et2 se ainda não existirem
    with app.app_context():
        try:
            cols = db.session.execute(text("PRAGMA table_info(knockout_match)"))
            names = {row[1] for row in cols}
            if 'et1' not in names:
                db.session.execute(text("ALTER TABLE knockout_match ADD COLUMN et1 INTEGER"))
            if 'et2' not in names:
                db.session.execute(text("ALTER TABLE knockout_match ADD COLUMN et2 INTEGER"))
            db.session.commit()
        except Exception:
            db.session.rollback()

def init_db():
    with app.app_context():
        db.create_all()
        ensure_knockout_schema()
        # Apenas insere os times se a tabela estiver vazia
        if not Team.query.first():
            for group, teams in GROUPS.items():
                for team_name in teams:
                    team = Team(name=team_name, group=group)
                    db.session.add(team)
            db.session.commit()

            # Criar jogos da fase de grupos com a ordem correta
            group_matches = {
                'A': [
                    ('França', 'Romênia', 1),
                    ('Albânia', 'Suíça', 1),
                    ('Romênia', 'Suíça', 2),
                    ('França', 'Albânia', 2),
                    ('Suíça', 'França', 3),
                    ('Romênia', 'Albânia', 3)
                ],
                'B': [
                    ('País de Gales', 'Eslováquia', 1),
                    ('Inglaterra', 'Rússia', 1),
                    ('Rússia', 'Eslováquia', 2),
                    ('Inglaterra', 'País de Gales', 2),
                    ('Rússia', 'País de Gales', 3),
                    ('Eslováquia', 'Inglaterra', 3)
                ],
                'C': [
                    ('Polônia', 'Irlanda do Norte', 1),
                    ('Alemanha', 'Ucrânia', 1),
                    ('Ucrânia', 'Irlanda do Norte', 2),
                    ('Alemanha', 'Polônia', 2),
                    ('Ucrânia', 'Polônia', 3),
                    ('Irlanda do Norte', 'Alemanha', 3)
                ],
                'D': [
                    ('Turquia', 'Croácia', 1),
                    ('Espanha', 'República Tcheca', 1),
                    ('República Tcheca', 'Croácia', 2),
                    ('Espanha', 'Turquia', 2),
                    ('República Tcheca', 'Turquia', 3),
                    ('Croácia', 'Espanha', 3)
                ],
                'E': [
                    ('República da Irlanda', 'Suécia', 1),
                    ('Bélgica', 'Itália', 1),
                    ('Itália', 'Suécia', 2),
                    ('Bélgica', 'República da Irlanda', 2),
                    ('Suécia', 'Bélgica', 3),
                    ('Itália', 'República da Irlanda', 3)
                ],
                'F': [
                    ('Áustria', 'Hungria', 1),
                    ('Portugal', 'Islândia', 1),
                    ('Islândia', 'Hungria', 2),
                    ('Portugal', 'Áustria', 2),
                    ('Islândia', 'Áustria', 3),
                    ('Hungria', 'Portugal', 3)
                ]
            }
            
            for group, matches in group_matches.items():
                for team1_name, team2_name, matchday in matches:
                    t1 = Team.query.filter_by(name=team1_name).first()
                    t2 = Team.query.filter_by(name=team2_name).first()
                    match = Match(
                        team1_id=t1.id,
                        team2_id=t2.id,
                        round='group',
                        group=group,
                        matchday=matchday
                    )
                    db.session.add(match)
            db.session.commit()

@app.route('/')
def index():
    return render_template('index.html', groups=GROUPS)

@app.route('/api/groups')
def get_groups():
    teams = Team.query.all()
    # Calcula V/E/D a partir dos jogos da fase de grupos já disputados
    matches = Match.query.filter_by(round='group').all()
    extra = {team.id: {'wins': 0, 'draws': 0, 'losses': 0} for team in teams}
    for m in matches:
        if m.team1_goals is None or m.team2_goals is None:
            continue
        if m.team1_goals > m.team2_goals:
            extra[m.team1_id]['wins'] += 1
            extra[m.team2_id]['losses'] += 1
        elif m.team1_goals < m.team2_goals:
            extra[m.team2_id]['wins'] += 1
            extra[m.team1_id]['losses'] += 1
        else:
            extra[m.team1_id]['draws'] += 1
            extra[m.team2_id]['draws'] += 1

    groups_data = {}
    for team in teams:
        if team.group not in groups_data:
            groups_data[team.group] = []
        groups_data[team.group].append({
            'name': team.name,
            'points': team.points,
            'goals_for': team.goals_for,
            'goals_against': team.goals_against,
            'goal_difference': team.goal_difference,
            'matches_played': team.matches_played,
            'wins': extra[team.id]['wins'],
            'draws': extra[team.id]['draws'],
            'losses': extra[team.id]['losses']
        })
    return jsonify(groups_data)

@app.route('/api/matches')
def get_matches():
    matches = Match.query.all()
    matches_data = []
    for match in matches:
        team1 = Team.query.get(match.team1_id)
        team2 = Team.query.get(match.team2_id)
        matches_data.append({
            'id': match.id,
            'team1': team1.name,
            'team2': team2.name,
            'team1_goals': match.team1_goals,
            'team2_goals': match.team2_goals,
            'round': match.round,
            'group': match.group,
            'matchday': match.matchday
        })
    return jsonify(matches_data)

# ===== Desempates oficiais (1-6) em Python =====
def compute_h2h_stats(names_set, group_matches):
    stats = {n: {'pts': 0, 'gd': 0, 'gf': 0} for n in names_set}
    for m in group_matches:
        t1 = Team.query.get(m.team1_id).name
        t2 = Team.query.get(m.team2_id).name
        if t1 not in names_set or t2 not in names_set:
            continue
        if m.team1_goals is None or m.team2_goals is None:
            continue
        g1, g2 = m.team1_goals, m.team2_goals
        stats[t1]['gf'] += g1
        stats[t1]['gd'] += (g1 - g2)
        stats[t2]['gf'] += g2
        stats[t2]['gd'] += (g2 - g1)
        if g1 > g2:
            stats[t1]['pts'] += 3
        elif g2 > g1:
            stats[t2]['pts'] += 3
        else:
            stats[t1]['pts'] += 1
            stats[t2]['pts'] += 1
    return stats

def resolve_cluster_by_h2h(cluster, group_matches):
    names = [t.name for t in cluster]
    h2h = compute_h2h_stats(set(names), group_matches)
    ordered = sorted(cluster, key=lambda t: (h2h[t.name]['pts'], h2h[t.name]['gd'], h2h[t.name]['gf']), reverse=True)
    # detect blocks still equal after H2H
    final_order = []
    i = 0
    while i < len(ordered):
        j = i + 1
        ai = h2h[ordered[i].name]
        while j < len(ordered):
            aj = h2h[ordered[j].name]
            if aj['pts'] == ai['pts'] and aj['gd'] == ai['gd'] and aj['gf'] == ai['gf']:
                j += 1
            else:
                break
        block = ordered[i:j]
        if len(block) > 1:
            # Se continuam iguais, aplicar critérios 5 e 6 (saldo e gols gerais)
            block = sorted(block, key=lambda t: (t.goal_difference, t.goals_for), reverse=True)
        final_order.extend(block)
        i = j
    return final_order

def sort_group_with_tiebreakers(group_letter: str):
    teams = Team.query.filter_by(group=group_letter).all()
    # ordenar por pontos primeiro
    base = sorted(teams, key=lambda t: t.points, reverse=True)
    group_match_rows = Match.query.filter_by(round='group', group=group_letter).all()
    result = []
    i = 0
    while i < len(base):
        j = i + 1
        while j < len(base) and base[j].points == base[i].points:
            j += 1
        cluster = base[i:j]
        if len(cluster) == 1:
            result.append(cluster[0])
        else:
            resolved = resolve_cluster_by_h2h(cluster, group_match_rows)
            result.extend(resolved)
        i = j
    return result

def compute_group_winners_runners_thirds():
    winners = {}
    runners = {}
    thirds = {}
    for g in sorted(GROUPS.keys()):
        ordered = sort_group_with_tiebreakers(g)
        winners[g] = ordered[0]
        runners[g] = ordered[1]
        thirds[g] = ordered[2]
    return winners, runners, thirds

def best_four_thirds(thirds_dict):
    arr = [{'group': g, 'team': t} for g, t in thirds_dict.items()]
    arr.sort(key=lambda x: (x['team'].points, x['team'].goals_for - x['team'].goals_against, x['team'].goals_for, x['group']), reverse=True)
    return arr[:4]

THIRD_MAP = {
    # Oficial UEFA Euro 2016: 1A só enfrenta 3C/3D/3E; 1B -> 3A/3C/3D; 1C -> 3A/3B/3F; 1D -> 3B/3E/3F
    'ABCD': { '1A': '3C', '1B': '3D', '1C': '3A', '1D': '3B' },
    'ABCE': { '1A': '3C', '1B': '3A', '1C': '3B', '1D': '3E' },
    'ABCF': { '1A': '3C', '1B': '3A', '1C': '3B', '1D': '3F' },
    'ABDE': { '1A': '3D', '1B': '3A', '1C': '3B', '1D': '3E' },
    'ABDF': { '1A': '3D', '1B': '3A', '1C': '3B', '1D': '3F' },
    'ABEF': { '1A': '3E', '1B': '3A', '1C': '3B', '1D': '3F' },
    'ACDE': { '1A': '3C', '1B': '3D', '1C': '3A', '1D': '3E' },
    'ACDF': { '1A': '3C', '1B': '3D', '1C': '3A', '1D': '3F' },
    'ACEF': { '1A': '3C', '1B': '3A', '1C': '3F', '1D': '3E' },
    'ADEF': { '1A': '3D', '1B': '3A', '1C': '3F', '1D': '3E' },
    'BCDE': { '1A': '3C', '1B': '3D', '1C': '3B', '1D': '3E' },
    'BCDF': { '1A': '3C', '1B': '3D', '1C': '3B', '1D': '3F' },
    'BCEF': { '1A': '3E', '1B': '3C', '1C': '3B', '1D': '3F' },
    'BDEF': { '1A': '3E', '1B': '3D', '1C': '3B', '1D': '3F' },
    'CDEF': { '1A': '3C', '1B': '3D', '1C': '3F', '1D': '3E' }
}

NEXT_MAP = {
    ('R16', 1): ('QF', 1, 'team1'),
    ('R16', 2): ('QF', 1, 'team2'),
    ('R16', 3): ('QF', 2, 'team1'),
    ('R16', 4): ('QF', 2, 'team2'),
    ('R16', 5): ('QF', 3, 'team1'),
    ('R16', 6): ('QF', 3, 'team2'),
    ('R16', 7): ('QF', 4, 'team1'),
    ('R16', 8): ('QF', 4, 'team2'),
    ('QF', 1): ('SF', 1, 'team1'),
    ('QF', 2): ('SF', 1, 'team2'),
    ('QF', 3): ('SF', 2, 'team1'),
    ('QF', 4): ('SF', 2, 'team2'),
    ('SF', 1): ('F', 1, 'team1'),
    ('SF', 2): ('F', 1, 'team2'),
}

def knockout_clear_all():
    for km in KnockoutMatch.query.all():
        db.session.delete(km)
    db.session.commit()

def knockout_reseed():
    winners, runners, thirds = compute_group_winners_runners_thirds()
    top_four = best_four_thirds(thirds)
    third_key = ''.join(sorted([x['group'] for x in top_four]))
    mapping = THIRD_MAP.get(third_key)
    def pick_third(code):
        if not code: return None
        g = code[1]
        for x in top_four:
            if x['group'] == g:
                return x['team']
        return None

    # Oitavas (R16)
    pairs = [
        ('R16', 1, runners['A'], runners['C']),
        ('R16', 2, winners['D'], pick_third(mapping['1D']) if mapping else None),
        ('R16', 3, winners['B'], pick_third(mapping['1B']) if mapping else None),
        ('R16', 4, winners['F'], runners['E']),
        ('R16', 5, winners['C'], pick_third(mapping['1C']) if mapping else None),
        ('R16', 6, winners['E'], runners['D']),
        ('R16', 7, winners['A'], pick_third(mapping['1A']) if mapping else None),
        ('R16', 8, runners['B'], runners['F']),
    ]

    knockout_clear_all()
    # criar slots QF, SF, F vazios
    for i in range(1, 5):
        db.session.add(KnockoutMatch(stage='QF', slot=i))
    for i in range(1, 2+1):
        db.session.add(KnockoutMatch(stage='SF', slot=i))
    db.session.add(KnockoutMatch(stage='F', slot=1))
    db.session.flush()

    # mapear next pointers
    for i in range(1, 9):
        ns = NEXT_MAP[('R16', i)]
        db.session.add(KnockoutMatch(stage='R16', slot=i, next_stage=ns[0], next_slot=ns[1], next_side=ns[2]))
    db.session.flush()

    # preencher times das oitavas
    for stage, slot, t1, t2 in pairs:
        km = KnockoutMatch.query.filter_by(stage=stage, slot=slot).first()
        km.team1_id = t1.id if t1 else None
        km.team2_id = t2.id if t2 else None
    db.session.commit()

@app.route('/api/knockout/reseed', methods=['POST'])
def api_knockout_reseed():
    knockout_reseed()
    return jsonify({'success': True})

@app.route('/api/knockout')
def api_knockout_get():
    if not KnockoutMatch.query.first():
        knockout_reseed()
    teams = {t.id: t.name for t in Team.query.all()}
    stages = {'R16': [], 'QF': [], 'SF': [], 'F': []}
    # calcular meta de terceiros
    winners, runners, thirds = compute_group_winners_runners_thirds()
    top_four = best_four_thirds(thirds)
    third_key = ''.join(sorted([x['group'] for x in top_four]))
    mapping = THIRD_MAP.get(third_key, {})
    # coleta de partidas
    all_km = KnockoutMatch.query.all()
    for km in all_km:
        entry = {
            'id': km.id,
            'stage': km.stage,
            'slot': km.slot,
            'home': teams.get(km.team1_id),
            'away': teams.get(km.team2_id),
            'team1_goals': km.team1_goals,
            'team2_goals': km.team2_goals,
            'et1': km.et1,
            'et2': km.et2,
            'pen1': km.pen1,
            'pen2': km.pen2,
        }
        # anota seeds para R16 conforme a ordem oficial
        if km.stage == 'R16':
            if km.slot == 1:
                entry['home_seed'] = '2A'; entry['away_seed'] = '2C'
            elif km.slot == 2:
                entry['home_seed'] = '1D'; entry['away_seed'] = mapping.get('1D')
            elif km.slot == 3:
                entry['home_seed'] = '1B'; entry['away_seed'] = mapping.get('1B')
            elif km.slot == 4:
                entry['home_seed'] = '1F'; entry['away_seed'] = '2E'
            elif km.slot == 5:
                entry['home_seed'] = '1C'; entry['away_seed'] = mapping.get('1C')
            elif km.slot == 6:
                entry['home_seed'] = '1E'; entry['away_seed'] = '2D'
            elif km.slot == 7:
                entry['home_seed'] = '1A'; entry['away_seed'] = mapping.get('1A')
            elif km.slot == 8:
                entry['home_seed'] = '2B'; entry['away_seed'] = '2F'
        stages[km.stage].append(entry)
    for k in stages:
        stages[k].sort(key=lambda x: x['slot'])
    return jsonify({
        'stages': stages,
        'meta': {
            'third_groups_key': third_key,
            'seed_map': mapping
        }
    })

def clear_downstream_from(stage, slot):
    # limpa encadeamento a jusante (times e placares)
    cur = (stage, slot)
    while cur in NEXT_MAP:
        ns = NEXT_MAP[cur]
        nm = KnockoutMatch.query.filter_by(stage=ns[0], slot=ns[1]).first()
        if not nm: break
        if ns[2] == 'team1':
            nm.team1_id = None
        else:
            nm.team2_id = None
        nm.team1_goals = nm.team2_goals = nm.et1 = nm.et2 = nm.pen1 = nm.pen2 = None
        cur = (nm.stage, nm.slot)

@app.route('/api/knockout/update', methods=['POST'])
def api_knockout_update():
    ensure_knockout_schema()
    data = request.json
    km = KnockoutMatch.query.get(data['match_id'])
    if not km:
        return jsonify({'error': 'Knockout match not found'}), 404
    # atualizar placar
    km.team1_goals = data.get('team1_goals')
    km.team2_goals = data.get('team2_goals')
    km.et1 = data.get('et1')
    km.et2 = data.get('et2')
    km.pen1 = data.get('pen1')
    km.pen2 = data.get('pen2')

    # decidir vencedor
    winner_id = None
    if km.team1_goals is not None and km.team2_goals is not None:
        if km.team1_goals > km.team2_goals:
            winner_id = km.team1_id
        elif km.team2_goals > km.team1_goals:
            winner_id = km.team2_id
        else:
            # 90' empatado -> considerar prorrogação
            if km.et1 is not None and km.et2 is not None:
                if km.et1 > km.et2:
                    winner_id = km.team1_id
                elif km.et2 > km.et1:
                    winner_id = km.team2_id
                else:
                    # após prorrogação ainda empatado -> pênaltis
                    if km.pen1 is not None and km.pen2 is not None and km.pen1 != km.pen2:
                        winner_id = km.team1_id if km.pen1 > km.pen2 else km.team2_id
            # caso contrário, ainda indefinido

    # limpa a jusante e propaga vencedor
    clear_downstream_from(km.stage, km.slot)
    if winner_id and (km.stage, km.slot) in NEXT_MAP:
        ns = NEXT_MAP[(km.stage, km.slot)]
        nm = KnockoutMatch.query.filter_by(stage=ns[0], slot=ns[1]).first()
        if nm:
            if ns[2] == 'team1':
                nm.team1_id = winner_id
            else:
                nm.team2_id = winner_id

    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/update_match', methods=['POST'])
def update_match():
    data = request.json
    match = Match.query.get(data['match_id'])
    if not match:
        return jsonify({'error': 'Match not found'}), 404

    old_team1_goals = match.team1_goals
    old_team2_goals = match.team2_goals

    # Se o jogo já tinha resultado, remove os pontos antigos
    if old_team1_goals is not None and old_team2_goals is not None:
        update_team_stats(match.team1_id, match.team2_id, old_team1_goals, old_team2_goals, remove=True)

    # Atualiza o resultado do jogo
    match.team1_goals = data['team1_goals']
    match.team2_goals = data['team2_goals']
    
    # Adiciona os novos pontos
    update_team_stats(match.team1_id, match.team2_id, match.team1_goals, match.team2_goals)
    
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/clear_match', methods=['POST'])
def clear_match():
    data = request.json
    match = Match.query.get(data.get('match_id'))
    if not match:
        return jsonify({'error': 'Match not found'}), 404

    # Se tinha resultado, desfaz o impacto nas estatísticas
    if match.team1_goals is not None and match.team2_goals is not None:
        update_team_stats(match.team1_id, match.team2_id, match.team1_goals, match.team2_goals, remove=True)

    match.team1_goals = None
    match.team2_goals = None
    db.session.commit()
    return jsonify({'success': True})

def update_team_stats(team1_id, team2_id, goals1, goals2, remove=False):
    team1 = Team.query.get(team1_id)
    team2 = Team.query.get(team2_id)
    
    multiplier = -1 if remove else 1
    
    # Atualiza gols
    team1.goals_for += goals1 * multiplier
    team1.goals_against += goals2 * multiplier
    team2.goals_for += goals2 * multiplier
    team2.goals_against += goals1 * multiplier
    
    # Atualiza jogos disputados
    if not remove:
        team1.matches_played += 1
        team2.matches_played += 1
    else:
        team1.matches_played -= 1
        team2.matches_played -= 1
    
    # Atualiza pontos
    if goals1 > goals2:
        team1.points += 3 * multiplier
    elif goals2 > goals1:
        team2.points += 3 * multiplier
    else:
        team1.points += 1 * multiplier
        team2.points += 1 * multiplier

@app.route('/api/reset_all', methods=['POST'])
def reset_all():
    # Zera todos os resultados e estatísticas sem apagar o arquivo do banco
    for m in Match.query.all():
        m.team1_goals = None
        m.team2_goals = None
    for t in Team.query.all():
        t.points = 0
        t.goals_for = 0
        t.goals_against = 0
        t.matches_played = 0
    # limpa também o mata-mata
    knockout_clear_all()
    db.session.commit()
    return jsonify({'success': True})

if __name__ == '__main__':
    init_db()
    app.run(debug=True)