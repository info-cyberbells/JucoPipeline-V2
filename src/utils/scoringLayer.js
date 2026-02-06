/**
 * Scoring Layer Utility
 * - Runtime only (NO DB writes)
 * - Linear scaling (1–100)
 * - Dataset scope = current API response
 * - Supports multiple battingStats / pitchingStats per player
 */

const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

const mean = arr => arr.reduce((s, v) => s + v, 0) / arr.length || 0;

const stdDev = arr => {
    const m = mean(arr);
    const variance = arr.reduce((s, v) => s + Math.pow(v - m, 2), 0) / arr.length || 0;
    return Math.sqrt(variance);
};

const zScore = (value, m, sd) => {
    if (!sd) return 0;
    return clamp((value - m) / sd, -2, 2);
};

export function applyScoringLayer(players = [], regionMap = {}) {
    const hitters = [];

    // console.log('Processing player:', players);

    /* -----------------------------
       STEP 1: Collect eligible hitters
    ------------------------------ */
    players.forEach(player => {
        (player.battingStats || []).forEach(stat => {
            if (stat.at_bats >= 75) {
                hitters.push({ player, stat });
            }
        });
    });
    
    if (!hitters.length) return players;

    /* -----------------------------
       STEP 2: Calculate derived stats
    ------------------------------ */
    hitters.forEach(h => {
        const s = h.stat;

        const AB = s.at_bats || 0;
        const BB = s.walks || 0;
        const HBP = s.hit_by_pitch || 0;
        const SF = s.sacrifice_flies || 0;
        const H = s.hits || 0;
        const SO = s.strikeouts || 0;

        const doubles = s.doubles || 0;
        const triples = s.triples || 0;
        const HR = s.home_runs || 0;

        const PA = AB + BB + HBP + SF;
        const AVG = AB ? H / AB : 0;

        const singles = H - doubles - triples - HR;
        const TB = singles + 2 * doubles + 3 * triples + 4 * HR;

        const SLG = AB ? TB / AB : 0;
        const ISO = SLG - AVG;
        const OBP = PA ? (H + BB + HBP) / PA : 0;
        const KRate = PA ? SO / PA : 0;

        const SB = s.stolen_bases || 0;
        const CS = s.caught_stealing || 0;
        const SBCS = SB + CS > 0 ? (SB - CS) / (SB + CS) : 0;

        h.derived = { OBP, ISO, SLG, KRate, SBCS };
    });

    /* -----------------------------
       STEP 3: Dataset stats
    ------------------------------ */
    const obps = hitters.map(h => h.derived.OBP);
    const isos = hitters.map(h => h.derived.ISO);
    const slgs = hitters.map(h => h.derived.SLG);
    const ks = hitters.map(h => h.derived.KRate);

    const stats = {
        OBP: { m: mean(obps), sd: stdDev(obps) },
        ISO: { m: mean(isos), sd: stdDev(isos) },
        SLG: { m: mean(slgs), sd: stdDev(slgs) },
        K: { m: mean(ks), sd: stdDev(ks) }
    };

    /* -----------------------------
       STEP 4: Raw Hitter Score
    ------------------------------ */
    hitters.forEach(h => {
        const d = h.derived;

        const raw =
            0.4 * zScore(d.OBP, stats.OBP.m, stats.OBP.sd) +
            0.25 * zScore(d.ISO, stats.ISO.m, stats.ISO.sd) +
            0.15 * zScore(d.SLG, stats.SLG.m, stats.SLG.sd) -
            0.1 * zScore(d.KRate, stats.K.m, stats.K.sd) +
            0.1 * d.SBCS;

        h.rawScore = raw;
    });

    /* -----------------------------
       STEP 5: Region Adjustment
    ------------------------------ */
    hitters.forEach(h => {
        const region = h.player.region;
        const multiplier = region && regionMap[region] ? regionMap[region].multiplier : 1;

        h.adjustedScore = h.rawScore * multiplier;
    });

    /* -----------------------------
       STEP 6: Linear Scaling (1–100)
    ------------------------------ */
    const adjustedScores = hitters.map(h => h.adjustedScore);
    const min = Math.min(...adjustedScores);
    const max = Math.max(...adjustedScores);

    hitters.forEach(h => {
        const scaled =
            max !== min
                ? ((h.adjustedScore - min) / (max - min)) * 99 + 1
                : 50;

        h.stat.finalScore = Math.round(clamp(scaled, 1, 100));
    });

    /* -----------------------------
    STEP 6.5: JP Rank (Dense Ranking)
    - Based on finalScore
    - Dataset scope = current API response
    ------------------------------ */

    const rankedHitters = hitters.filter(h => typeof h.stat.finalScore === "number").sort((a, b) => b.stat.finalScore - a.stat.finalScore);
    let currentRank = 1;
    let lastScore = null;

    rankedHitters.forEach((h, index) => {
        const score = h.stat.finalScore;

        if (lastScore !== null && score < lastScore) {
            currentRank = index + 1;
        }

        h.stat.jpRank = currentRank;
        lastScore = score;
    });

    // Non-eligible hitters (AB < 75)
    players.forEach(player => {
        (player.battingStats || []).forEach(stat => {
            if (!stat.finalScore) {
                stat.jpRank = null;
            }
        });
    });

    /* -----------------------------
       STEP 7: WHIP (runtime only)
    ------------------------------ */
    players.forEach(player => {
        (player.pitchingStats || []).forEach(p => {
            const BB = p.walks_allowed || 0;
            const H = p.hits_allowed || 0;
            const IP = p.innings_pitched || 0;

            p.whip = IP > 0 ? +((BB + H) / IP).toFixed(2) : 1.0;
        });
    });

    return players;
}
