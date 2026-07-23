-- 0004_messages_thinking.sql — V3 agent bubble: 持久化助手思考过程。
--
-- 之前 thinking 流式从 anthropic-transport 解析但只存于 pi-ai 内部 content[idx].thinking,
-- 未穿透 RuntimeEvent → store → UI,且不持久化,刷新会话即丢。
-- 新加 thinking TEXT 列 (NULL = 无思考) 让 assistant message 历史 reload 后仍可见。

ALTER TABLE messages ADD COLUMN thinking TEXT;