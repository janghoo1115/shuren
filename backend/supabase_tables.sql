-- 微信随心记系统 Supabase 数据库表结构
-- 请在Supabase控制台的SQL编辑器中运行这些命令

-- 1. 创建用户表
CREATE TABLE IF NOT EXISTS wechat_users (
  external_userid TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'unauth',
  access_token TEXT,
  main_document_id TEXT,
  user_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 创建用户操作日志表（移除外键约束，允许记录不存在用户的日志）
CREATE TABLE IF NOT EXISTS user_access_log (
  id BIGSERIAL PRIMARY KEY,
  external_userid TEXT,
  action TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_wechat_users_state ON wechat_users(state);
CREATE INDEX IF NOT EXISTS idx_wechat_users_updated_at ON wechat_users(updated_at);
CREATE INDEX IF NOT EXISTS idx_user_access_log_userid ON user_access_log(external_userid);
CREATE INDEX IF NOT EXISTS idx_user_access_log_timestamp ON user_access_log(timestamp);

-- 4. 创建更新时间自动更新的触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 先删除已存在的触发器，然后重新创建
DROP TRIGGER IF EXISTS update_wechat_users_updated_at ON wechat_users;
CREATE TRIGGER update_wechat_users_updated_at 
  BEFORE UPDATE ON wechat_users 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. 启用行级安全性（RLS）
ALTER TABLE wechat_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_access_log ENABLE ROW LEVEL SECURITY;

-- 6. 创建安全策略（允许所有操作，因为我们使用service key）
DROP POLICY IF EXISTS "Allow all operations on wechat_users" ON wechat_users;
CREATE POLICY "Allow all operations on wechat_users" ON wechat_users
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on user_access_log" ON user_access_log;
CREATE POLICY "Allow all operations on user_access_log" ON user_access_log
  FOR ALL USING (true) WITH CHECK (true);

-- 7. 插入测试数据（可选）
-- INSERT INTO wechat_users (external_userid, state, user_name) 
-- VALUES ('test_user_001', 'unauth', '测试用户');

-- 验证表是否创建成功
SELECT 
  table_name, 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns 
WHERE table_name IN ('wechat_users', 'user_access_log')
ORDER BY table_name, ordinal_position; 
