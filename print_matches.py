from app import app, Match, Team
with app.app_context():
    matches = Match.query.order_by(Match.group, Match.matchday, Match.id).all()
    for m in matches:
        t1 = Team.query.get(m.team1_id).name
        t2 = Team.query.get(m.team2_id).name
        print(f"group={m.group} | matchday={m.matchday} | id={m.id} | {t1} vs {t2}")
