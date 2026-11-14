use crate::domain::{
    AuthoritativeQuestion, CardChapter, PublicQuestion, RawQuestionInput, CARDS_PER_LEVEL,
};
use rand::seq::SliceRandom;
use rand::Rng;
use std::collections::HashSet;

const EMBEDDED_CARDS_JSON: &str = include_str!("../resources/card_bank.json");
const EMBEDDED_QUIZ_JSON: &str = include_str!("../resources/quiz_bank.json");

#[derive(Debug, Clone)]
pub struct QuestionBank {
    pub chapters: Vec<CardChapter>,
    pub questions: Vec<AuthoritativeQuestion>,
}

impl QuestionBank {
    pub fn load_with_extras(extra_inputs: &[RawQuestionInput]) -> Result<Self, String> {
        let chapters: Vec<CardChapter> = serde_json::from_str(EMBEDDED_CARDS_JSON)
            .map_err(|e| format!("解析内嵌知识卡失败: {e}"))?;
        let base_raw: Vec<RawQuestionInput> = serde_json::from_str(EMBEDDED_QUIZ_JSON)
            .map_err(|e| format!("解析内嵌题库失败: {e}"))?;

        let mut questions = Vec::with_capacity(base_raw.len() + extra_inputs.len());
        for raw in &base_raw {
            if let Some(q) = normalize_question(raw, questions.len(), false) {
                questions.push(q);
            }
        }
        for extra in extra_inputs {
            if let Some(q) = normalize_question(extra, questions.len(), true) {
                questions.push(q);
            }
        }

        Ok(Self {
            chapters,
            questions,
        })
    }

    pub fn total_levels(&self) -> u32 {
        if self.questions.is_empty() {
            1
        } else {
            self.questions.len().div_ceil(CARDS_PER_LEVEL) as u32
        }
    }

    pub fn total_cards(&self) -> usize {
        self.chapters.iter().map(|c| c.cards.len()).sum()
    }

    pub fn card_exists(&self, card_id: &str) -> bool {
        let Some(rest) = card_id.strip_prefix('c') else {
            return false;
        };
        let Some((ci_s, idx_s)) = rest.split_once('_') else {
            return false;
        };
        let (Ok(ci), Ok(idx)) = (ci_s.parse::<usize>(), idx_s.parse::<usize>()) else {
            return false;
        };
        self.chapters
            .get(ci)
            .map(|ch| idx < ch.cards.len())
            .unwrap_or(false)
    }

    pub fn explain_for(&self, tag: &str, doc: Option<&str>) -> String {
        if let Some(d) = doc.map(str::trim).filter(|d| !d.is_empty()) {
            let is_bare_citation = d.starts_with("Python 官方文档") || d.starts_with("PEP ");
            if !is_bare_citation {
                return d.to_string();
            }
        }
        for ch in &self.chapters {
            for card in &ch.cards {
                if card.tag == tag {
                    return card.a.clone();
                }
            }
        }
        doc.map(str::trim)
            .filter(|d| !d.is_empty())
            .unwrap_or("回顾一下该知识点的定义与常见写法。")
            .to_string()
    }

    pub fn build_level_questions<R: Rng>(&self, level: u32, rng: &mut R) -> Vec<PublicQuestion> {
        let lv = level.max(1) as usize;
        let start = (lv - 1) * CARDS_PER_LEVEL;
        if start >= self.questions.len() {
            return Vec::new();
        }
        let end = (start + CARDS_PER_LEVEL).min(self.questions.len());
        self.questions[start..end]
            .iter()
            .enumerate()
            .map(|(i, q)| to_public_question(q, format!("{lv}-{}", i + 1), rng))
            .collect()
    }

    pub fn get_by_bid(&self, bid: isize) -> Option<&AuthoritativeQuestion> {
        if bid < 0 {
            return None;
        }
        self.questions.get(bid as usize)
    }
}

pub fn normalize_answer_index(val: Option<&serde_json::Value>) -> Option<usize> {
    let v = val?;
    if let Some(n) = v.as_u64() {
        if n < 4 {
            return Some(n as usize);
        }
    } else if let Some(s) = v.as_str() {
        let trimmed = s.trim().to_ascii_uppercase();
        if trimmed.len() == 1 {
            if let Some(idx) = "ABCD".find(&trimmed) {
                return Some(idx);
            }
        }
    }
    None
}

pub fn normalize_question(
    raw: &RawQuestionInput,
    bid: usize,
    is_extra: bool,
) -> Option<AuthoritativeQuestion> {
    let q_stem = raw.q.as_deref()?.trim();
    if q_stem.is_empty() {
        return None;
    }
    let raw_q = raw.q.clone()?;
    let q_type = raw.q_type.as_deref().unwrap_or("choice");

    if q_type == "code" {
        return Some(AuthoritativeQuestion {
            bid,
            m: raw
                .m
                .clone()
                .unwrap_or_else(|| if is_extra { "EXTRA" } else { "L1" }.to_string()),
            tag: raw
                .tag
                .clone()
                .unwrap_or_else(|| if is_extra { "扩展题" } else { "代码实战" }.to_string()),
            q_type: "code".to_string(),
            q: raw_q,
            opts: Vec::new(),
            ans_index: 0,
            ans_text: "见参考答案".to_string(),
            ref_code: raw.ref_code.clone(),
            expect: raw.expect.clone(),
            doc: raw.doc.clone(),
        });
    }

    let opts = raw.opts.as_ref()?;
    if opts.len() != 4 {
        return None;
    }
    let unique: HashSet<&str> = opts.iter().map(|s| s.as_str()).collect();
    if unique.len() != 4 {
        return None;
    }
    let ans_index = normalize_answer_index(raw.ans.as_ref())?;
    let ans_text = opts.get(ans_index)?.clone();

    Some(AuthoritativeQuestion {
        bid,
        m: raw
            .m
            .clone()
            .unwrap_or_else(|| if is_extra { "EXTRA" } else { "L1" }.to_string()),
        tag: raw
            .tag
            .clone()
            .unwrap_or_else(|| if is_extra { "扩展题" } else { "基础语法" }.to_string()),
        q_type: "choice".to_string(),
        q: raw_q,
        opts: opts.clone(),
        ans_index,
        ans_text,
        ref_code: None,
        expect: None,
        doc: raw.doc.clone(),
    })
}

pub fn to_public_question<R: Rng>(
    q: &AuthoritativeQuestion,
    id: String,
    rng: &mut R,
) -> PublicQuestion {
    if q.q_type == "code" {
        return PublicQuestion {
            id,
            bid: q.bid as isize,
            m: q.m.clone(),
            tag: q.tag.clone(),
            q_type: "code".to_string(),
            q: q.q.clone(),
            opts: None,
            ref_code: q.ref_code.clone(),
            expect: q.expect.clone(),
            doc: q.doc.clone(),
        };
    }

    let mut shuffled = q.opts.clone();
    shuffled.shuffle(rng);

    PublicQuestion {
        id,
        bid: q.bid as isize,
        m: q.m.clone(),
        tag: q.tag.clone(),
        q_type: "choice".to_string(),
        q: q.q.clone(),
        opts: Some(shuffled),
        ref_code: None,
        expect: None,
        doc: q.doc.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;

    #[test]
    fn loads_embedded_banks_with_exact_counts() {
        let bank = QuestionBank::load_with_extras(&[]).expect("bank should load");
        assert_eq!(bank.chapters.len(), 12);
        assert_eq!(bank.total_cards(), 95);
        assert_eq!(bank.questions.len(), 160);
        assert_eq!(bank.total_levels(), 20);
        assert!(bank.card_exists("c0_0"));
        assert!(bank.card_exists("c8_8"));
        assert!(bank.card_exists("c11_7"));
        assert!(!bank.card_exists("c12_0"));
    }

    #[test]
    fn validates_extra_questions_and_skips_invalid() {
        let extras = vec![
            // Valid letter answer
            RawQuestionInput {
                m: Some("M13".into()),
                kind: None,
                tag: Some("扩展".into()),
                q_type: None,
                q: Some("len('abc') == ?".into()),
                opts: Some(vec!["1".into(), "3".into(), "2".into(), "0".into()]),
                ans: Some(serde_json::json!("B")),
                ref_code: None,
                expect: None,
                doc: Some("测试扩展".into()),
            },
            // Invalid duplicate options -> skipped
            RawQuestionInput {
                m: Some("M13".into()),
                kind: None,
                tag: Some("坏题".into()),
                q_type: None,
                q: Some("bad?".into()),
                opts: Some(vec!["1".into(), "1".into(), "2".into(), "3".into()]),
                ans: Some(serde_json::json!(0)),
                ref_code: None,
                expect: None,
                doc: None,
            },
        ];
        let bank = QuestionBank::load_with_extras(&extras).unwrap();
        assert_eq!(bank.questions.len(), 161);
        assert_eq!(bank.total_levels(), 21);
        assert_eq!(bank.questions[160].ans_text, "3");
    }

    #[test]
    fn shuffles_options_without_losing_choices_or_leaking_answer() {
        let bank = QuestionBank::load_with_extras(&[]).unwrap();
        let mut rng = rand::rngs::StdRng::seed_from_u64(42);
        let pub_qs = bank.build_level_questions(1, &mut rng);
        assert_eq!(pub_qs.len(), 8);
        let orig_set: HashSet<&String> = bank.questions[0].opts.iter().collect();
        let shuf_set: HashSet<&String> = pub_qs[0].opts.as_ref().unwrap().iter().collect();
        assert_eq!(orig_set, shuf_set);
        let serialized = serde_json::to_string(&pub_qs[0]).unwrap();
        assert!(!serialized.contains("ansText"));
        assert!(!serialized.contains("\"ans\""));

        // Ensure explain_for prioritizes the exact question's doc over generic chapter card.a
        let q0 = &bank.questions[0];
        let q1 = &bank.questions[1];
        assert_eq!(bank.explain_for(&q0.tag, q0.doc.as_deref()), "注释不产生输出");
        assert_eq!(
            bank.explain_for(&q1.tag, q1.doc.as_deref()),
            "引号只是标记，不显示出来"
        );
    }
}
