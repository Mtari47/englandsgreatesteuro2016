// Estado global
let matches = [];
let groups = {};
const suppressCommitMatches = new Set();
let knockoutVisible = false; // only show knockout once user generates

// Official schedule per group (order and matchday)
const GROUP_SCHEDULE = {
    A: [
        { t1: 'França', t2: 'Romênia', md: 1 },
        { t1: 'Albânia', t2: 'Suíça', md: 1 },
        { t1: 'Romênia', t2: 'Suíça', md: 2 },
        { t1: 'França', t2: 'Albânia', md: 2 },
        { t1: 'Suíça', t2: 'França', md: 3 },
        { t1: 'Romênia', t2: 'Albânia', md: 3 }
    ],
    B: [
        { t1: 'País de Gales', t2: 'Eslováquia', md: 1 },
        { t1: 'Inglaterra', t2: 'Rússia', md: 1 },
        { t1: 'Rússia', t2: 'Eslováquia', md: 2 },
        { t1: 'Inglaterra', t2: 'País de Gales', md: 2 },
        { t1: 'Rússia', t2: 'País de Gales', md: 3 },
        { t1: 'Eslováquia', t2: 'Inglaterra', md: 3 }
    ],
    C: [
        { t1: 'Polônia', t2: 'Irlanda do Norte', md: 1 },
        { t1: 'Alemanha', t2: 'Ucrânia', md: 1 },
        { t1: 'Ucrânia', t2: 'Irlanda do Norte', md: 2 },
        { t1: 'Alemanha', t2: 'Polônia', md: 2 },
        { t1: 'Ucrânia', t2: 'Polônia', md: 3 },
        { t1: 'Irlanda do Norte', t2: 'Alemanha', md: 3 }
    ],
    D: [
        { t1: 'Turquia', t2: 'Croácia', md: 1 },
        { t1: 'Espanha', t2: 'República Tcheca', md: 1 },
        { t1: 'República Tcheca', t2: 'Croácia', md: 2 },
        { t1: 'Espanha', t2: 'Turquia', md: 2 },
        { t1: 'República Tcheca', t2: 'Turquia', md: 3 },
        { t1: 'Croácia', t2: 'Espanha', md: 3 }
    ],
    E: [
        { t1: 'República da Irlanda', t2: 'Suécia', md: 1 },
        { t1: 'Bélgica', t2: 'Itália', md: 1 },
        { t1: 'Itália', t2: 'Suécia', md: 2 },
        { t1: 'Bélgica', t2: 'República da Irlanda', md: 2 },
        { t1: 'Itália', t2: 'República da Irlanda', md: 3 },
        { t1: 'Suécia', t2: 'Bélgica', md: 3 }
    ],
    F: [
        { t1: 'Áustria', t2: 'Hungria', md: 1 },
        { t1: 'Portugal', t2: 'Islândia', md: 1 },
        { t1: 'Islândia', t2: 'Hungria', md: 2 },
        { t1: 'Portugal', t2: 'Áustria', md: 2 },
        { t1: 'Islândia', t2: 'Áustria', md: 3 },
        { t1: 'Hungria', t2: 'Portugal', md: 3 }
    ]
};

// English fallback for groups (no backend)
const DEFAULT_GROUPS = {
        A: ['France', 'Romania', 'Albania', 'Switzerland'],
        B: ['England', 'Russia', 'Wales', 'Slovakia'],
        C: ['Germany', 'Ukraine', 'Poland', 'Northern Ireland'],
        D: ['Spain', 'Czech Republic', 'Turkey', 'Croatia'],
        E: ['Belgium', 'Italy', 'Republic of Ireland', 'Sweden'],
        F: ['Portugal', 'Iceland', 'Austria', 'Hungary']
};

// Map DB/team names (pt) -> display (en) to keep backend stable
const TEAM_NAME_EN = new Map([
    ['França', 'France'],
    ['Romênia', 'Romania'],
    ['Albânia', 'Albania'],
    ['Suíça', 'Switzerland'],
    ['Inglaterra', 'England'],
    ['Rússia', 'Russia'],
    ['País de Gales', 'Wales'],
    ['Eslováquia', 'Slovakia'],
    ['Alemanha', 'Germany'],
    ['Ucrânia', 'Ukraine'],
    ['Polônia', 'Poland'],
    ['Irlanda do Norte', 'Northern Ireland'],
    ['Espanha', 'Spain'],
    ['República Tcheca', 'Czech Republic'],
    ['Turquia', 'Turkey'],
    ['Croácia', 'Croatia'],
    ['Bélgica', 'Belgium'],
    ['Itália', 'Italy'],
    ['República da Irlanda', 'Republic of Ireland'],
    ['Suécia', 'Sweden'],
    ['Portugal', 'Portugal'],
    ['Islândia', 'Iceland'],
    ['Áustria', 'Austria'],
    ['Hungria', 'Hungary']
]);
function nameEN(n) { return TEAM_NAME_EN.get(n) || n; }

// Load initial data (robust to backend failures)
async function loadData() {
    try {
        await Promise.allSettled([loadGroups(), loadMatches()]);
    } catch (_) {
        // mesmo em caso de erro, seguimos para atualizar a UI com o que houver (fallbacks)
    }
    updateUI();
}

async function loadGroups() {
    try {
        const response = await fetch('/api/groups');
        if (!response.ok) throw new Error('bad status');
        const data = await response.json();
        if (!data || Object.keys(data).length === 0) throw new Error('empty');
        groups = normalizeGroups(data);
    } catch (e) {
    // fallback from embedded HTML
        const el = document.getElementById('bootstrapGroups');
        if (el && el.textContent) {
            try { groups = normalizeGroups(JSON.parse(el.textContent)); } catch { groups = normalizeGroups(DEFAULT_GROUPS); }
        } else {
            groups = normalizeGroups(DEFAULT_GROUPS);
        }
    }
}

function normalizeGroups(raw) {
    // Converte A->[strings] ou A->[{name,...}] para A->[{name,points,...}]
    const out = {};
    for (const [g, arr] of Object.entries(raw || {})) {
        out[g] = (arr || []).map(item => {
            if (typeof item === 'string') {
                return {
                    name: item,
                    points: 0,
                    goals_for: 0,
                    goals_against: 0,
                    goal_difference: 0,
                    matches_played: 0,
                    wins: 0,
                    draws: 0,
                    losses: 0,
                };
            }
            // already with stats from backend
            return item;
        });
    }
    return out;
}

async function loadMatches() {
    try {
        const response = await fetch('/api/matches');
        if (!response.ok) throw new Error('bad status');
        matches = await response.json();
    } catch (e) {
    // If backend is down, keep empty list so tables render and page doesn't break
        matches = [];
    }
}

// UI update
function updateUI() {
    updateGroupTables();
    updateMatchCards();
    updateKOControls();
}

function updateGroupTables() {
    for (const [group, teams] of Object.entries(groups)) {
        const tbody = document.querySelector(`#group${group}Table tbody`);
        if (!tbody) continue;
        tbody.innerHTML = '';

        const sortedTeams = sortGroupTeamsByTiebreakers(group, teams);

        for (const team of sortedTeams) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${nameEN(team.name)}</td>
                <td>${team.points}</td>
                <td>${team.matches_played}</td>
                <td>${team.wins}</td>
                <td>${team.draws}</td>
                <td>${team.losses}</td>
                <td>${team.goals_for}</td>
                <td>${team.goals_against}</td>
                <td>${team.goal_difference}</td>
            `;
            tbody.appendChild(row);
        }
    // Note: official tiebreakers applied inside sortGroupTeamsByTiebreakers
    }
}

// ===== Group tiebreaker helpers =====
function computeH2HStats(nameSet, groupMatches) {
    const stats = new Map();
    const ensure = (n) => {
        if (!stats.has(n)) stats.set(n, { pts: 0, gd: 0, gf: 0 });
        return stats.get(n);
    };
    for (const m of groupMatches) {
        if (!nameSet.has(m.team1) || !nameSet.has(m.team2)) continue;
        if (m.team1_goals == null || m.team2_goals == null) continue;
        const g1 = m.team1_goals;
        const g2 = m.team2_goals;
        const s1 = ensure(m.team1);
        const s2 = ensure(m.team2);
    // goals and goal difference
        s1.gf += g1; s2.gf += g2;
        s1.gd += (g1 - g2); s2.gd += (g2 - g1);
    // points
        if (g1 > g2) { s1.pts += 3; }
        else if (g2 > g1) { s2.pts += 3; }
        else { s1.pts += 1; s2.pts += 1; }
    }
    return stats;
}

function resolveClusterByH2H(clusterTeams, groupMatches) {
    // Compute H2H stats for cluster
    const nameSet = new Set(clusterTeams.map(t => t.name));
    const h2h = computeH2HStats(nameSet, groupMatches);

    // Sort by (h2h_pts, h2h_gd, h2h_gf)
    let ordered = [...clusterTeams].sort((a, b) => {
        const A = h2h.get(a.name) || { pts: 0, gd: 0, gf: 0 };
        const B = h2h.get(b.name) || { pts: 0, gd: 0, gf: 0 };
        if (A.pts !== B.pts) return B.pts - A.pts;
        if (A.gd !== B.gd) return B.gd - A.gd;
        if (A.gf !== B.gf) return B.gf - A.gf;
        return 0;
    });

    // Check if any separation happened (any difference in 1–3)
    const allEqual = ordered.every((t, idx, arr) => {
        if (idx === 0) return true;
        const prev = arr[idx - 1];
        const A = h2h.get(t.name) || { pts: 0, gd: 0, gf: 0 };
        const B = h2h.get(prev.name) || { pts: 0, gd: 0, gf: 0 };
        return A.pts === B.pts && A.gd === B.gd && A.gf === B.gf;
    });

    if (allEqual) {
    // Criteria 5 and 6
        return ordered.sort((a, b) => {
            if (a.goal_difference !== b.goal_difference) return b.goal_difference - a.goal_difference;
            if (a.goals_for !== b.goals_for) return b.goals_for - a.goals_for;
            return a.name.localeCompare(b.name); // estabilidade determinística
        });
    }

    // Separation happened: re-apply 1–3 to sub-clusters still tied
    const finalOrder = [];
    let i = 0;
    while (i < ordered.length) {
        let k = i + 1;
        const Ai = h2h.get(ordered[i].name) || { pts: 0, gd: 0, gf: 0 };
        while (k < ordered.length) {
            const Ak = h2h.get(ordered[k].name) || { pts: 0, gd: 0, gf: 0 };
            if (Ak.pts === Ai.pts && Ak.gd === Ai.gd && Ak.gf === Ai.gf) k++; else break;
        }
        const subgroup = ordered.slice(i, k);
        if (subgroup.length > 1) {
            // Re-apply 1–3 to this subset only
            const subNames = new Set(subgroup.map(t => t.name));
            const subMatches = groupMatches.filter(m => subNames.has(m.team1) && subNames.has(m.team2));
            const resolvedSub = resolveClusterByH2H(subgroup, subMatches);
            finalOrder.push(...resolvedSub);
        } else {
            finalOrder.push(subgroup[0]);
        }
        i = k;
    }
    return finalOrder;
}

function sortGroupTeamsByTiebreakers(group, teams) {
    const groupMatches = matches.filter(m => m.group === group && m.round === 'group');
    // First by total points
    const byPoints = [...teams].sort((a, b) => b.points - a.points);
    const result = [];
    let i = 0;
    while (i < byPoints.length) {
        const j = i + 1;
        let k = j;
        while (k < byPoints.length && byPoints[k].points === byPoints[i].points) k++;
        const cluster = byPoints.slice(i, k);
        if (cluster.length === 1) {
            result.push(cluster[0]);
        } else {
            const resolved = resolveClusterByH2H(cluster, groupMatches);
            result.push(...resolved);
        }
        i = k;
    }
    return result;
}

function updateMatchCards() {
    for (const group of Object.keys(groups)) {
        const container = document.querySelector(`#group${group}Matches`);
        if (!container) continue;
        const groupMatches = matches.filter(m => m.group === group && m.round === 'group');
        container.innerHTML = '';

        const schedule = GROUP_SCHEDULE[group] || [];
        const items = schedule
            .map((x, i) => ({ ...x, _idx: i }))
            .sort((a, b) => (a.md - b.md) || (a._idx - b._idx))
            .map(fix => {
                const m = groupMatches.find(x =>
                    (x.team1 === fix.t1 && x.team2 === fix.t2) ||
                    (x.team1 === fix.t2 && x.team2 === fix.t1)
                );
                if (!m) return null;
                const reversed = !(m.team1 === fix.t1 && m.team2 === fix.t2);
                return { match: m, fixture: fix, reversed };
            })
            .filter(Boolean);

        for (const { match, fixture, reversed } of items) {
            const card = createMatchCard(match, fixture, reversed);
            container.appendChild(card);
        }
    }
}

function createMatchCard(match, fixture, reversed) {
    const div = document.createElement('div');
    div.className = 'match-card';
    const leftGoals = !reversed ? (match.team1_goals ?? '') : (match.team2_goals ?? '');
    const rightGoals = !reversed ? (match.team2_goals ?? '') : (match.team1_goals ?? '');
    div.innerHTML = `
        <div class="match-teams">
            <span class="team-name">${nameEN(fixture.t1)}</span>
            <div class="match-score">
                <input type="number" min="0" inputmode="numeric" pattern="[0-9]*" class="form-control score-input"
                    value="${leftGoals}"
                    data-match-id="${match.id}" data-side="left" data-reversed="${reversed}">
                <span>x</span>
                <input type="number" min="0" inputmode="numeric" pattern="[0-9]*" class="form-control score-input"
                    value="${rightGoals}"
                    data-match-id="${match.id}" data-side="right" data-reversed="${reversed}">
                <button class="btn btn-sm btn-outline-secondary clear-btn" data-match-id="${match.id}">Clear</button>
            </div>
            <span class="team-name text-end">${nameEN(fixture.t2)}</span>
        </div>
        <div class="text-muted text-center">Matchday ${fixture.md}</div>
    `;
    return div;
}

// Commit de placar somente em change/blur/Enter para permitir múltiplos dígitos
async function commitScoreFrom(inputEl) {
    const matchId = parseInt(inputEl.dataset.matchId);
    const side = inputEl.dataset.side; // 'left' | 'right'
    const reversed = inputEl.dataset.reversed === 'true';
    if (suppressCommitMatches.has(matchId)) return; // evitando commit quando clicando em Limpar
    const otherSide = side === 'left' ? 'right' : 'left';
    const otherInput = document.querySelector(`.score-input[data-match-id="${matchId}"][data-side="${otherSide}"]`);
    const val = (inputEl.value ?? '').trim();
    const otherVal = otherInput ? (otherInput.value ?? '').trim() : '';

    if (val === '' || otherVal === '') return; // só envia quando ambos preenchidos

    const left = side === 'left' ? parseInt(val, 10) : parseInt(otherVal, 10);
    const right = side === 'right' ? parseInt(val, 10) : parseInt(otherVal, 10);
    if (Number.isNaN(left) || Number.isNaN(right)) return;
    const team1_goals = !reversed ? left : right;
    const team2_goals = !reversed ? right : left;

    try {
        const response = await fetch('/api/update_match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ match_id: matchId, team1_goals, team2_goals })
        });
        if (response.ok) {
            await loadData();
        } else {
            console.error('Failed to update result');
        }
    } catch (error) {
    console.error('Error updating result:', error);
    }
}

// change: quando o usuário "confirma" o campo (blur ou enter em alguns navegadores)
document.addEventListener('change', (e) => {
    const input = e.target;
    if (!input.classList || !input.classList.contains('score-input')) return;
    const matchId = parseInt(input.dataset.matchId);
    if (suppressCommitMatches.has(matchId)) return;
    commitScoreFrom(input);
});

// blur não borbulha, então usamos captura para garanti-lo
document.addEventListener('blur', (e) => {
    const input = e.target;
    if (!input.classList || !input.classList.contains('score-input')) return;
    const matchId = parseInt(input.dataset.matchId);
    if (suppressCommitMatches.has(matchId)) return;
    commitScoreFrom(input);
}, true);

// Enter envia imediatamente
document.addEventListener('keydown', (e) => {
    const input = e.target;
    if (e.key !== 'Enter') return;
    if (!input.classList || !input.classList.contains('score-input')) return;
    const matchId = parseInt(input.dataset.matchId);
    if (suppressCommitMatches.has(matchId)) return;
    e.preventDefault();
    commitScoreFrom(input);
});

// Clear button: reset match score and update UI
document.addEventListener('click', async (e) => {
    const btn = e.target;
    if (!btn.classList || !btn.classList.contains('clear-btn')) return;
    const matchId = parseInt(btn.dataset.matchId, 10);
    // avoid blur/change/enter commits while clearing
    suppressCommitMatches.add(matchId);
    // immediate feedback: clear inputs visually
    document.querySelectorAll(`.score-input[data-match-id="${matchId}"]`).forEach(inp => inp.value = '');
    try {
        const response = await fetch('/api/clear_match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ match_id: matchId })
        });
        if (response.ok) {
            await loadData();
        } else {
            console.error('Failed to clear result');
        }
    } catch (err) {
    console.error('Error clearing result:', err);
    } finally {
        suppressCommitMatches.delete(matchId);
    }
});
async function fetchAndRenderKnockoutFromBackend() {
    try {
    // Do not reseed here to avoid losing user-entered scores
        const res = await fetch('/api/knockout');
        if (!res.ok) throw new Error('Falha ao obter mata-mata');
        const data = await res.json();
        renderKnockoutBackend(data);
    } catch (e) {
    console.error('KO backend failed:', e);
    }
}
function renderKnockoutBackend(payload) {
        const knockoutDiv = document.getElementById('knockoutStage');
        knockoutDiv.innerHTML = '';
        const { stages, meta } = payload;

    // Badge with third-place combination and seed map
        const info = document.createElement('div');
        info.className = 'alert alert-secondary py-2';
    const seedMapStr = (meta && meta.seed_map) ? Object.entries(meta.seed_map).map(([k,v])=>`${k}→${v||'-'}`).join(' · ') : '';
    info.innerHTML = `<strong>Third-places combination:</strong> ${(meta && meta.third_groups_key) || '-'}<br><small>${seedMapStr}</small>`;
        knockoutDiv.appendChild(info);

        const order = ['R16', 'QF', 'SF', 'F'];
    const titles = ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'];
        const container = document.createElement('div');
        container.className = 'bracket';
        order.forEach((stage, idx) => {
            const col = document.createElement('div');
            col.className = 'bracket-col';
            const h = document.createElement('h5');
            h.textContent = titles[idx];
            col.appendChild(h);
            stages[stage].forEach(m => {
                const card = document.createElement('div');
                card.className = 'knockout-match';
                const ninetyComplete = m.team1_goals != null && m.team2_goals != null;
                const needET = ninetyComplete && m.team1_goals === m.team2_goals;
                const etComplete = m.et1 != null && m.et2 != null;
                const showPens = needET && etComplete && m.et1 === m.et2;
                const seedBadge = m.home_seed || m.away_seed ? `<div class="text-muted" style="font-size: 0.8rem;">${m.home_seed || ''} × ${m.away_seed || ''}</div>` : '';
                card.innerHTML = `
                    ${seedBadge}
                    <div class="ko-row">
                        <span class="ko-team">${m.home ? nameEN(m.home) : '-'}</span>
                        <input type="number" min="0" class="form-control ko-score-b" data-ko-id="${m.id}" data-field="team1_goals" value="${m.team1_goals ?? ''}">
                    </div>
                    <div class="ko-row">
                        <span class="ko-team">${m.away ? nameEN(m.away) : '-'}</span>
                        <input type="number" min="0" class="form-control ko-score-b" data-ko-id="${m.id}" data-field="team2_goals" value="${m.team2_goals ?? ''}">
                    </div>
                    <div class="ko-extra ${needET ? '' : 'd-none'}">
                        <small>Extra time</small>
                        <div class="ko-row">
                            <span class="ko-team">${m.home ? nameEN(m.home) : '-'}</span>
                            <input type="number" min="0" class="form-control ko-et-b" data-ko-id="${m.id}" data-field="et1" value="${m.et1 ?? ''}">
                        </div>
                        <div class="ko-row">
                            <span class="ko-team">${m.away ? nameEN(m.away) : '-'}</span>
                            <input type="number" min="0" class="form-control ko-et-b" data-ko-id="${m.id}" data-field="et2" value="${m.et2 ?? ''}">
                        </div>
                    </div>
                    <div class="ko-penalty ${showPens ? '' : 'd-none'}">
                        <small>Penalties</small>
                        <div class="ko-row">
                            <span class="ko-team">${m.home ? nameEN(m.home) : '-'}</span>
                            <input type="number" min="0" class="form-control ko-pen-b" data-ko-id="${m.id}" data-field="pen1" value="${m.pen1 ?? ''}">
                        </div>
                        <div class="ko-row">
                            <span class="ko-team">${m.away ? nameEN(m.away) : '-'}</span>
                            <input type="number" min="0" class="form-control ko-pen-b" data-ko-id="${m.id}" data-field="pen2" value="${m.pen2 ?? ''}">
                        </div>
                    </div>
                `;
                col.appendChild(card);
            });
            container.appendChild(col);
        });
    knockoutDiv.appendChild(container);
}
// Init
document.addEventListener('DOMContentLoaded', loadData);

// Reset tournament button
document.addEventListener('click', async (e) => {
    const btn = e.target;
    if (!(btn instanceof HTMLElement)) return;
    if (btn.id !== 'resetAllBtn') return;
    const ok = window.confirm('Do you really want to reset the entire tournament? This will erase all results.');
    if (!ok) return;
    try {
        const response = await fetch('/api/reset_all', { method: 'POST' });
        if (response.ok) {
            knockoutVisible = false;
            document.getElementById('knockoutStage').innerHTML = '';
            await loadData();
        } else {
            console.error('Failed to reset the tournament');
        }
    } catch (err) {
    console.error('Error resetting the tournament:', err);
    }
});

// Generate knockout button
document.addEventListener('click', async (e) => {
    const btn = e.target;
    if (!(btn instanceof HTMLElement)) return;
    if (btn.id !== 'generateKO') return;
    if (btn.disabled) return;
    try {
    // only generate when all group matches are complete
        await fetch('/api/knockout/reseed', { method: 'POST' });
        knockoutVisible = true;
    // scroll to bracket and render
        fetchAndRenderKnockoutFromBackend();
        document.getElementById('knockoutStage').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
    console.error('Error generating knockout:', err);
    }
});

    // Knockout inputs (backend)
    document.addEventListener('change', async (e) => {
        const el = e.target;
        if (!el.classList || !(el.classList.contains('ko-score-b') || el.classList.contains('ko-pen-b') || el.classList.contains('ko-et-b'))) return;
        const id = parseInt(el.dataset.koId, 10);
        const cards = el.closest('.knockout-match');
    // collect card values
        const payload = { match_id: id };
        ['team1_goals','team2_goals','et1','et2','pen1','pen2'].forEach(f => {
            const inp = cards.querySelector(`[data-ko-id="${id}"][data-field="${f}"]`);
                if (inp) payload[f] = inp.value === '' ? null : parseInt(inp.value, 10);
        });
        try {
            const res = await fetch('/api/knockout/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!res.ok) {
                const t = await res.json().catch(() => ({}));
                console.error('Failed to update KO', t);
            }
        } catch (err) {
            console.error('KO update error:', err);
        } finally {
            // Reload KO state
            if (knockoutVisible) fetchAndRenderKnockoutFromBackend();
        }
    });

    // Enter in knockout inputs: commit immediately
    document.addEventListener('keydown', (e) => {
        const el = e.target;
        if (e.key !== 'Enter') return;
        if (!el.classList) return;
        if (!(el.classList.contains('ko-score-b') || el.classList.contains('ko-et-b') || el.classList.contains('ko-pen-b'))) return;
        e.preventDefault();
        // dispara um change para reaproveitar o fluxo de envio
        el.dispatchEvent(new Event('change', { bubbles: true }));
    });

// ======= Generate knockout button control =======
function allGroupMatchesCompleted() {
    const groupMatches = matches.filter(m => m.round === 'group');
    if (groupMatches.length === 0) return false;
    return groupMatches.every(m => m.team1_goals != null && m.team2_goals != null);
}

function updateKOControls() {
    const btn = document.getElementById('generateKO');
    const hint = document.getElementById('knockoutHint');
    if (!btn || !hint) return;
    const ready = allGroupMatchesCompleted();
    btn.disabled = !ready;
    hint.textContent = ready
    ? 'All group stage matches are complete. Click "Generate knockout" to build the bracket.'
    : 'Complete all group stage matches to enable the knockout bracket.';

    const stage = document.getElementById('knockoutStage');
    if (knockoutVisible) {
    // keep bracket updated when visible
        fetchAndRenderKnockoutFromBackend();
    } else {
        stage.innerHTML = '';
    }
}

// EOF
