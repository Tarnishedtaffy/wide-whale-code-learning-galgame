use crate::bank::QuestionBank;
use crate::domain::{
    GradeSessionResult, PublicQuestion, QuizAnswerInput, QuizGradedItem, SubmitQuizRequest,
    UserSaveState, WrongBookItem, CARDS_PER_LEVEL, SAVE_VERSION, WRONG_MASTER_N,
};
use std::collections::BTreeMap;

pub fn is_level_unlocked(level: u32, cleared: &BTreeMap<String, bool>) -> bool {
    if level <= 1 {
        return true;
    }
    let prev_key = (level - 1).to_string();
    cleared.get(&prev_key).copied().unwrap_or(false)
}

pub fn is_level_playable(level: u32, cleared: &BTreeMap<String, bool>) -> bool {
    let key = level.to_string();
    is_level_unlocked(level, cleared) || cleared.get(&key).copied().unwrap_or(false)
}

pub fn bump_level(current_level: u32, target_level: u32, total_levels: u32) -> u32 {
    let clamped = target_level.clamp(1, total_levels.max(1));
    current_level.max(clamped).min(total_levels.max(1))
}

pub fn enforce_state_invariants(state: &mut UserSaveState, total_levels: u32) {
    state.schema_version = SAVE_VERSION;
    let trimmed = state.name.split_whitespace().collect::<Vec<_>>().join(" ");
    let chars: String = trimmed.chars().take(12).collect();
    state.name = if chars.is_empty() {
        "用户1".to_string()
    } else {
        chars
    };

    // Remove any bogus "0" or negative level keys from cleared
    state.cleared.retain(|k, &mut v| {
        if !v {
            return false;
        }
        k.parse::<u32>().map(|n| n >= 1 && n <= total_levels).unwrap_or(false)
    });

    let max_cleared = state
        .cleared
        .keys()
        .filter_map(|k| k.parse::<u32>().ok())
        .max()
        .unwrap_or(0);
    state.current_level = (max_cleared + 1).clamp(1, total_levels.max(1));

    if !(1970..=2999).contains(&state.cal_ym.y) || !(1..=12).contains(&state.cal_ym.m) {
        let now = chrono::Local::now();
        use chrono::Datelike;
        state.cal_ym.y = now.year();
        state.cal_ym.m = now.month();
    }

    if state.mem_search_hist.len() > 10 {
        state.mem_search_hist.truncate(10);
    }
}

pub fn mark_checkin_today(state: &mut UserSaveState, today_key: &str, food_icon: &str) {
    if let Some(existing) = state.checkin.get(today_key) {
        if !existing.is_empty() {
            return;
        }
    }
    state
        .checkin
        .insert(today_key.to_string(), vec![food_icon.to_string()]);
}

pub fn master_card_once(
    state: &mut UserSaveState,
    card_id: &str,
    today_key: &str,
    food_icon: &str,
) -> bool {
    if state.mastered.get(card_id).copied().unwrap_or(false) {
        return false;
    }
    state.mastered.insert(card_id.to_string(), true);
    state.love = state.love.saturating_add(1);
    mark_checkin_today(state, today_key, food_icon);
    true
}

pub fn build_wrong_practice_questions(
    state: &UserSaveState,
    keys: &[String],
) -> (Vec<String>, Vec<PublicQuestion>) {
    let target_keys: Vec<String> = if keys.is_empty() {
        state.wrong_book.keys().cloned().collect()
    } else {
        keys.to_vec()
    };

    let mut used_keys = Vec::new();
    let mut out = Vec::new();
    for k in target_keys {
        let Some(it) = state.wrong_book.get(&k) else {
            continue;
        };
        used_keys.push(k.clone());
        let bid = it.bid.unwrap_or(-1);
        if it.q_type == "code" {
            out.push(PublicQuestion {
                id: format!("w-{k}"),
                bid,
                m: it.m.clone(),
                tag: it.tag.clone(),
                q_type: "code".to_string(),
                q: it.q.clone(),
                opts: None,
                ref_code: it.ref_code.clone(),
                expect: it.expect.clone(),
                doc: it.doc.clone(),
            });
        } else {
            out.push(PublicQuestion {
                id: format!("w-{k}"),
                bid,
                m: it.m.clone(),
                tag: it.tag.clone(),
                q_type: "choice".to_string(),
                q: it.q.clone(),
                opts: Some(it.opts.clone().unwrap_or_default()),
                ref_code: None,
                expect: None,
                doc: it.doc.clone(),
            });
        }
    }
    (used_keys, out)
}

fn wrong_key_of(bid: isize, m: &str, tag: &str, q: &str) -> String {
    if bid >= 0 {
        format!("b{bid}")
    } else {
        format!("{m}|{tag}|{q}")
    }
}

fn level_of_bid(bid: isize) -> Option<u32> {
    if bid < 0 {
        None
    } else {
        Some(((bid as usize) / CARDS_PER_LEVEL + 1) as u32)
    }
}

pub fn record_quiz_step(
    bank: &QuestionBank,
    state: &mut UserSaveState,
    ans: &QuizAnswerInput,
    now_ms: u64,
) -> Result<QuizGradedItem, String> {
    grade_single_answer(bank, state, ans, true, now_ms)
}

fn grade_single_answer(
    bank: &QuestionBank,
    state: &mut UserSaveState,
    ans: &QuizAnswerInput,
    update_wrong_book: bool,
    now_ms: u64,
) -> Result<QuizGradedItem, String> {
    if let Some(auth_q) = bank.get_by_bid(ans.bid) {
        let (ok, chosen) = if auth_q.q_type == "code" {
            let judge = ans.self_judge_ok.unwrap_or(false);
            (
                judge,
                if judge {
                    "自评正确".to_string()
                } else {
                    "自评错误".to_string()
                },
            )
        } else {
            let c = ans.chosen_text.clone().unwrap_or_default();
            let is_ok = !c.is_empty() && c == auth_q.ans_text;
            (is_ok, c)
        };

        let wkey = wrong_key_of(ans.bid, &auth_q.m, &auth_q.tag, &auth_q.q);
        let legacy_key = format!("{}|{}|{}", auth_q.m, auth_q.tag, auth_q.q);

        let (streak, removed) = if update_wrong_book {
            if !ok {
                record_wrong_answer(
                    state,
                    &wkey,
                    WrongSnapshot {
                        bid: Some(ans.bid),
                        m: &auth_q.m,
                        tag: &auth_q.tag,
                        q: &auth_q.q,
                        q_type: &auth_q.q_type,
                        opts: if auth_q.q_type == "code" {
                            None
                        } else {
                            Some(auth_q.opts.clone())
                        },
                        ans_text: &auth_q.ans_text,
                        ref_code: auth_q.ref_code.clone(),
                        expect: auth_q.expect.clone(),
                        doc: auth_q.doc.clone(),
                        chosen: &chosen,
                    },
                    now_ms,
                );
                (0, false)
            } else {
                if !state.wrong_book.contains_key(&wkey) && state.wrong_book.contains_key(&legacy_key)
                {
                    if let Some(mut migrated) = state.wrong_book.remove(&legacy_key) {
                        migrated.bid = Some(ans.bid);
                        state.wrong_book.insert(wkey.clone(), migrated);
                    }
                }
                record_right_answer(state, &wkey, now_ms)
            }
        } else if ok {
            let cur = state.wrong_book.get(&wkey).map(|it| it.correct).unwrap_or(0);
            (cur, false)
        } else {
            (0, false)
        };

        let explain = bank.explain_for(&auth_q.tag, auth_q.doc.as_deref());
        Ok(QuizGradedItem {
            question_id: ans.question_id.clone(),
            bid: ans.bid,
            m: auth_q.m.clone(),
            tag: auth_q.tag.clone(),
            q_type: auth_q.q_type.clone(),
            q: auth_q.q.clone(),
            chosen,
            ok,
            ans_text: if auth_q.q_type == "code" {
                "见参考答案".to_string()
            } else {
                auth_q.ans_text.clone()
            },
            explain,
            wrong_streak_count: streak,
            removed_from_wrong_book: removed,
        })
    } else {
        // Fallback for orphan wrong-book items without a valid current bank bid
        let wkey = ans
            .question_id
            .strip_prefix("w-")
            .unwrap_or(&ans.question_id)
            .to_string();
        if let Some(snap) = state.wrong_book.get(&wkey).cloned() {
            let (ok, chosen) = if snap.q_type == "code" {
                let judge = ans.self_judge_ok.unwrap_or(false);
                (
                    judge,
                    if judge {
                        "自评正确".to_string()
                    } else {
                        "自评错误".to_string()
                    },
                )
            } else {
                let c = ans.chosen_text.clone().unwrap_or_default();
                let is_ok = !c.is_empty() && c == snap.ans_text;
                (is_ok, c)
            };

            let (streak, removed) = if update_wrong_book {
                if !ok {
                    record_wrong_answer(
                        state,
                        &wkey,
                        WrongSnapshot {
                            bid: snap.bid,
                            m: &snap.m,
                            tag: &snap.tag,
                            q: &snap.q,
                            q_type: &snap.q_type,
                            opts: snap.opts.clone(),
                            ans_text: &snap.ans_text,
                            ref_code: snap.ref_code.clone(),
                            expect: snap.expect.clone(),
                            doc: snap.doc.clone(),
                            chosen: &chosen,
                        },
                        now_ms,
                    );
                    (0, false)
                } else {
                    record_right_answer(state, &wkey, now_ms)
                }
            } else if ok {
                (snap.correct, false)
            } else {
                (0, false)
            };

            let explain = bank.explain_for(&snap.tag, snap.doc.as_deref());
            Ok(QuizGradedItem {
                question_id: ans.question_id.clone(),
                bid: ans.bid,
                m: snap.m,
                tag: snap.tag,
                q_type: snap.q_type.clone(),
                q: snap.q,
                chosen,
                ok,
                ans_text: if snap.q_type == "code" {
                    "见参考答案".to_string()
                } else {
                    snap.ans_text
                },
                explain,
                wrong_streak_count: streak,
                removed_from_wrong_book: removed,
            })
        } else if !update_wrong_book {
            // Already mastered & removed during an earlier step in the same session
            let ok = ans.self_judge_ok.unwrap_or(true);
            let chosen = ans.chosen_text.clone().unwrap_or_else(|| "已掌握".to_string());
            Ok(QuizGradedItem {
                question_id: ans.question_id.clone(),
                bid: ans.bid,
                m: "错题巩固".to_string(),
                tag: "已掌握".to_string(),
                q_type: if ans.self_judge_ok.is_some() {
                    "code".to_string()
                } else {
                    "choice".to_string()
                },
                q: wkey,
                chosen: chosen.clone(),
                ok,
                ans_text: chosen,
                explain: String::new(),
                wrong_streak_count: WRONG_MASTER_N,
                removed_from_wrong_book: true,
            })
        } else {
            Err(format!("未找到题目记录: {}", ans.question_id))
        }
    }
}

pub fn grade_quiz_session(
    bank: &QuestionBank,
    state: &mut UserSaveState,
    req: &SubmitQuizRequest,
    today_key: &str,
    food_icon: &str,
    now_ms: u64,
) -> Result<GradeSessionResult, String> {
    if req.answers.is_empty() {
        return Err("提交的答卷为空".to_string());
    }

    if !req.is_wrong_practice {
        let lv = req.level.max(1) as u32;
        if !is_level_playable(lv, &state.cleared) {
            return Err(format!("先通过第 {} 关的测试", lv - 1));
        }
    }

    let mut graded_items = Vec::with_capacity(req.answers.len());
    let mut right_count = 0usize;

    for (idx, ans) in req.answers.iter().enumerate() {
        let update_wb = idx >= req.recorded_count;
        let item = grade_single_answer(bank, state, ans, update_wb, now_ms)?;
        if item.ok {
            right_count += 1;
        }
        graded_items.push(item);
    }

    let total = graded_items.len();
    let all_right = right_count == total;
    let pass_line = ((total as f64) * 0.75).ceil() as usize;
    let passed = right_count >= pass_line;

    if passed && !req.is_wrong_practice {
        let lv = req.level.max(1) as u32;
        state.cleared.insert(lv.to_string(), true);
        state.current_level = bump_level(state.current_level, lv + 1, bank.total_levels());
        state.love = state.love.saturating_add(10);
        mark_checkin_today(state, today_key, food_icon);
    }

    Ok(GradeSessionResult {
        passed,
        all_right,
        right: right_count,
        total,
        pass_line,
        level: if req.is_wrong_practice {
            -1
        } else {
            req.level.max(1)
        },
        is_wrong_practice: req.is_wrong_practice,
        elapsed_sec: req.elapsed_sec,
        items: graded_items,
        state: state.clone(),
    })
}

struct WrongSnapshot<'a> {
    bid: Option<isize>,
    m: &'a str,
    tag: &'a str,
    q: &'a str,
    q_type: &'a str,
    opts: Option<Vec<String>>,
    ans_text: &'a str,
    ref_code: Option<String>,
    expect: Option<String>,
    doc: Option<String>,
    chosen: &'a str,
}

fn record_wrong_answer(state: &mut UserSaveState, key: &str, snap: WrongSnapshot<'_>, now_ms: u64) {
    if let Some(existing) = state.wrong_book.get_mut(key) {
        if !snap.chosen.is_empty() {
            existing.chosen = snap.chosen.to_string();
        }
        existing.count = existing.count.saturating_add(1);
        existing.updated_at = now_ms;
        existing.best = existing.best.max(existing.correct);
        existing.correct = 0;
        if existing.level.is_none() {
            existing.level = existing.bid.and_then(level_of_bid);
        }
    } else {
        state.wrong_book.insert(
            key.to_string(),
            WrongBookItem {
                bid: snap.bid,
                m: snap.m.to_string(),
                tag: snap.tag.to_string(),
                q: snap.q.to_string(),
                q_type: snap.q_type.to_string(),
                level: snap.bid.and_then(level_of_bid),
                opts: snap.opts,
                ans_text: snap.ans_text.to_string(),
                ref_code: snap.ref_code,
                expect: snap.expect,
                doc: snap.doc,
                chosen: snap.chosen.to_string(),
                correct: 0,
                count: 1,
                best: 0,
                created_at: now_ms,
                updated_at: now_ms,
            },
        );
    }
}

fn record_right_answer(state: &mut UserSaveState, key: &str, now_ms: u64) -> (u32, bool) {
    let Some(item) = state.wrong_book.get_mut(key) else {
        return (0, false);
    };
    item.correct = item.correct.saturating_add(1);
    item.best = item.best.max(item.correct);
    item.updated_at = now_ms;
    let cur = item.correct;
    if cur >= WRONG_MASTER_N {
        state.wrong_book.remove(key);
        (WRONG_MASTER_N, true)
    } else {
        (cur, false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::QuizAnswerInput;

    #[test]
    fn grades_6_of_8_as_pass_and_advances_monotonically() {
        let bank = QuestionBank::load_with_extras(&[]).unwrap();
        let mut state = UserSaveState::default();

        // Build 6 right + 2 wrong answers for Level 1 (bids 0..8)
        let mut answers = Vec::new();
        for bid in 0..8usize {
            let q = &bank.questions[bid];
            let chosen = if bid < 6 {
                q.ans_text.clone()
            } else {
                q.opts
                    .iter()
                    .find(|o| **o != q.ans_text)
                    .unwrap()
                    .clone()
            };
            answers.push(QuizAnswerInput {
                question_id: format!("1-{}", bid + 1),
                bid: bid as isize,
                chosen_text: Some(chosen),
                self_judge_ok: None,
            });
        }

        let res = grade_quiz_session(
            &bank,
            &mut state,
            &SubmitQuizRequest {
                session_id: "s1".into(),
                level: 1,
                is_wrong_practice: false,
                wrong_keys: vec![],
                elapsed_sec: 42,
                answers,
                recorded_count: 0,
            },
            "2026-11-14",
            "🍰",
            1_700_000_000_000,
        )
        .unwrap();

        assert!(res.passed);
        assert!(!res.all_right);
        assert_eq!(res.right, 6);
        assert_eq!(res.pass_line, 6);
        assert_eq!(state.current_level, 2);
        assert_eq!(state.love, 10);
        assert_eq!(state.checkin.get("2026-11-14").unwrap().len(), 1);
        assert_eq!(state.wrong_book.len(), 2);

        // Replaying Level 1 after clearing Level 2 must NOT regress current_level!
        state.cleared.insert("2".into(), true);
        state.current_level = 3;
        let replay_answers: Vec<QuizAnswerInput> = (0..8usize)
            .map(|bid| QuizAnswerInput {
                question_id: format!("1-{}", bid + 1),
                bid: bid as isize,
                chosen_text: Some(bank.questions[bid].ans_text.clone()),
                self_judge_ok: None,
            })
            .collect();
        grade_quiz_session(
            &bank,
            &mut state,
            &SubmitQuizRequest {
                session_id: "s2".into(),
                level: 1,
                is_wrong_practice: false,
                wrong_keys: vec![],
                elapsed_sec: 20,
                answers: replay_answers,
                recorded_count: 0,
            },
            "2026-11-14",
            "🍩",
            1_700_000_010_000,
        )
        .unwrap();
        assert_eq!(state.current_level, 3);
        // Same-day checkin stays deduplicated at 1 icon
        assert_eq!(state.checkin.get("2026-11-14").unwrap().len(), 1);
    }

    #[test]
    fn wrong_practice_never_pollutes_cleared_or_love_and_removes_after_3_streaks() {
        let bank = QuestionBank::load_with_extras(&[]).unwrap();
        let mut state = UserSaveState::default();
        let q0 = &bank.questions[0];
        let wrong_opt = q0.opts.iter().find(|o| **o != q0.ans_text).unwrap().clone();

        // Fail Q0 in Level 1 first so it enters wrong_book
        let mut lv1_answers: Vec<QuizAnswerInput> = (0..8usize)
            .map(|bid| QuizAnswerInput {
                question_id: format!("1-{}", bid + 1),
                bid: bid as isize,
                chosen_text: Some(if bid == 0 {
                    wrong_opt.clone()
                } else {
                    bank.questions[bid].ans_text.clone()
                }),
                self_judge_ok: None,
            })
            .collect();
        // Make 3 wrong so level fails (5/8)
        lv1_answers[1].chosen_text = Some(
            bank.questions[1]
                .opts
                .iter()
                .find(|o| **o != bank.questions[1].ans_text)
                .unwrap()
                .clone(),
        );
        lv1_answers[2].chosen_text = Some(
            bank.questions[2]
                .opts
                .iter()
                .find(|o| **o != bank.questions[2].ans_text)
                .unwrap()
                .clone(),
        );

        let fail_res = grade_quiz_session(
            &bank,
            &mut state,
            &SubmitQuizRequest {
                session_id: "fail1".into(),
                level: 1,
                is_wrong_practice: false,
                wrong_keys: vec![],
                elapsed_sec: 15,
                answers: lv1_answers,
                recorded_count: 0,
            },
            "2026-11-14",
            "🍰",
            1000,
        )
        .unwrap();
        assert!(!fail_res.passed);
        assert_eq!(state.love, 0);
        assert!(state.wrong_book.contains_key("b0"));

        // Practice b0 three times in wrong practice mode -> removed on 3rd!
        for attempt in 1..=3 {
            let res = grade_quiz_session(
                &bank,
                &mut state,
                &SubmitQuizRequest {
                    session_id: format!("wp-{attempt}"),
                    level: -1,
                    is_wrong_practice: true,
                    wrong_keys: vec!["b0".into()],
                    elapsed_sec: 5,
                    answers: vec![QuizAnswerInput {
                        question_id: "w-b0".into(),
                        bid: 0,
                        chosen_text: Some(q0.ans_text.clone()),
                        self_judge_ok: None,
                    }],
                    recorded_count: 0,
                },
                "2026-11-14",
                "🍰",
                1000 + attempt * 100,
            )
            .unwrap();
            assert!(res.passed);
            assert_eq!(state.love, 0);
            assert!(state.cleared.is_empty());
            assert!(state.checkin.is_empty());
            if attempt < 3 {
                assert!(state.wrong_book.contains_key("b0"));
                assert_eq!(res.items[0].wrong_streak_count, attempt as u32);
                assert!(!res.items[0].removed_from_wrong_book);
            } else {
                assert!(!state.wrong_book.contains_key("b0"));
                assert!(res.items[0].removed_from_wrong_book);
            }
        }
    }

    #[test]
    fn step_by_step_recording_persists_immediately_without_double_counting() {
        let bank = QuestionBank::load_with_extras(&[]).unwrap();
        let mut state = UserSaveState::default();
        let q0 = &bank.questions[0];
        let wrong_opt = q0.opts.iter().find(|o| **o != q0.ans_text).unwrap().clone();

        // Step 0: user gets Q0 wrong and exits early -> wrong_book immediately has b0 with count == 1!
        let step0 = record_quiz_step(
            &bank,
            &mut state,
            &QuizAnswerInput {
                question_id: "1-1".into(),
                bid: 0,
                chosen_text: Some(wrong_opt.clone()),
                self_judge_ok: None,
            },
            2000,
        )
        .unwrap();
        assert!(!step0.ok);
        assert_eq!(state.wrong_book.get("b0").unwrap().count, 1);

        // Now simulate a full 8-question session where Q0..Q6 are recorded step-by-step
        // and Q7 is submitted at the end with recorded_count = 7
        let mut session_answers = Vec::new();
        for bid in 0..8usize {
            let ans = QuizAnswerInput {
                question_id: format!("1-{}", bid + 1),
                bid: bid as isize,
                chosen_text: Some(if bid == 0 {
                    wrong_opt.clone()
                } else {
                    bank.questions[bid].ans_text.clone()
                }),
                self_judge_ok: None,
            };
            if bid < 7 {
                record_quiz_step(&bank, &mut state, &ans, 3000 + bid as u64).unwrap();
            }
            session_answers.push(ans);
        }
        // b0 wrong count should be 2 (once from aborted session, once from step 0 of new session)
        assert_eq!(state.wrong_book.get("b0").unwrap().count, 2);

        let final_res = grade_quiz_session(
            &bank,
            &mut state,
            &SubmitQuizRequest {
                session_id: "step-sess".into(),
                level: 1,
                is_wrong_practice: false,
                wrong_keys: vec![],
                elapsed_sec: 30,
                answers: session_answers,
                recorded_count: 7,
            },
            "2026-11-14",
            "🍰",
            4000,
        )
        .unwrap();
        assert!(final_res.passed);
        assert_eq!(final_res.right, 7);
        // Must NOT be incremented a third time during final submit!
        assert_eq!(state.wrong_book.get("b0").unwrap().count, 2);

        // Verify calYM exact casing in JSON serialization
        let json_str = serde_json::to_string(&state).unwrap();
        assert!(json_str.contains("\"calYM\""));
        assert!(!json_str.contains("\"calYm\""));
    }
}
