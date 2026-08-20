import { round, score } from './score.js';

/**
 * Path to directory containing `_list.json` and all levels
 */
const dir = './data';

export async function fetchList() {
    try {
        const listResult = await fetch(`${dir}/_list.json`, {
            cache: 'no-cache',
        });

        if (!listResult.ok) {
            throw new Error(
                `Failed to fetch _list.json: HTTP ${listResult.status}`
            );
        }

        const list = await listResult.json();

        if (!Array.isArray(list)) {
            throw new Error('_list.json does not contain an array.');
        }

        return await Promise.all(
            list.map(async (path, rank) => {
                try {
                    const levelResult = await fetch(`${dir}/${path}.json`, {
                        cache: 'no-cache',
                    });

                    if (!levelResult.ok) {
                        throw new Error(
                            `HTTP ${levelResult.status}`
                        );
                    }

                    const level = await levelResult.json();

                    if (!level || typeof level !== 'object') {
                        throw new Error('Invalid level JSON.');
                    }

                    const records = Array.isArray(level.records)
                        ? level.records
                        : [];

                    return [
                        {
                            ...level,
                            path,
                            records: records.sort(
                                (a, b) => b.percent - a.percent
                            ),
                        },
                        null,
                    ];
                } catch (error) {
                    console.error(
                        `Failed to load level #${rank + 1} ${path}.`,
                        error
                    );

                    return [null, path];
                }
            })
        );
    } catch (error) {
        console.error('Failed to load list.', error);
        return null;
    }
}

export async function fetchEditors() {
    try {
        const editorsResults = await fetch(`${dir}/_editors.json`, {
            cache: 'no-cache',
        });

        if (!editorsResults.ok) {
            throw new Error(
                `HTTP ${editorsResults.status}`
            );
        }

        const editors = await editorsResults.json();

        return Array.isArray(editors) ? editors : null;
    } catch (error) {
        console.error('Failed to load list editors.', error);
        return null;
    }
}

export async function fetchLeaderboard() {
    const list = await fetchList();

    if (!list) {
        return [[], ['_list']];
    }

    const scoreMap = {};
    const errs = [];

    list.forEach(([level, err], rank) => {
        if (err || !level) {
            if (err) {
                errs.push(err);
            }
            return;
        }

        // Verification
        const verifier = Object.keys(scoreMap).find(
            (u) => u.toLowerCase() === level.verifier.toLowerCase(),
        ) || level.verifier;

        scoreMap[verifier] ??= {
            verified: [],
            completed: [],
            progressed: [],
        };

        const { verified } = scoreMap[verifier];

        verified.push({
            rank: rank + 1,
            level: level.name,
            score: score(rank + 1, 100, level.percentToQualify),
            link: level.verification,
        });

        // Records
        const records = Array.isArray(level.records)
            ? level.records
            : [];

        records.forEach((record) => {
            const user = Object.keys(scoreMap).find(
                (u) => u.toLowerCase() === record.user.toLowerCase(),
            ) || record.user;

            scoreMap[user] ??= {
                verified: [],
                completed: [],
                progressed: [],
            };

            const { completed, progressed } = scoreMap[user];

            if (record.percent === 100) {
                completed.push({
                    rank: rank + 1,
                    level: level.name,
                    score: score(
                        rank + 1,
                        100,
                        level.percentToQualify
                    ),
                    link: record.link,
                });

                return;
            }

            progressed.push({
                rank: rank + 1,
                level: level.name,
                percent: record.percent,
                score: score(
                    rank + 1,
                    record.percent,
                    level.percentToQualify
                ),
                link: record.link,
            });
        });
    });

    // Wrap in extra Object containing the user and total score
    const res = Object.entries(scoreMap).map(([user, scores]) => {
        const { verified, completed, progressed } = scores;

        const total = [verified, completed, progressed]
            .flat()
            .reduce((prev, cur) => prev + cur.score, 0);

        return {
            user,
            total: round(total),
            ...scores,
        };
    });

    // Sort by total score
    return [res.sort((a, b) => b.total - a.total), errs];
}
