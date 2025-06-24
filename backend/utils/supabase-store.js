const { createClient } = require('@supabase/supabase-js');

// Supabase配置
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 请设置SUPABASE_URL和SUPABASE_ANON_KEY环境变量');
  process.exit(1);
}

// 创建Supabase客户端
const supabase = createClient(supabaseUrl, supabaseKey);

class SupabaseStore {
  constructor() {
    this.tableName = 'wechat_users';
    console.log('✅ Supabase存储模块初始化完成');
  }

  // 测试数据库连接
  async testConnection() {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .select('count', { count: 'exact', head: true });
      
      if (error) {
        console.error('❌ Supabase连接测试失败:', error);
        return false;
      }
      
      console.log('✅ Supabase连接测试成功');
      return true;
    } catch (err) {
      console.error('❌ Supabase连接异常:', err);
      return false;
    }
  }

  // 保存/更新用户数据
  async saveUser(external_userid, state, feishuData = null) {
    try {
      const userData = {
        external_userid,
        state,
        access_token: feishuData?.access_token || null,
        main_document_id: feishuData?.main_document_id || null,
        user_name: feishuData?.user_name || null,
        updated_at: new Date().toISOString()
      };

      // 使用upsert操作（如果存在则更新，不存在则插入）
      const { data, error } = await supabase
        .from(this.tableName)
        .upsert(userData, {
          onConflict: 'external_userid'
        })
        .select();

      if (error) {
        console.error('❌ 保存用户数据失败:', error);
        return { success: false, error: error.message };
      }

      console.log(`✅ 用户数据保存成功: ${external_userid}, 状态: ${state}`);
      
      // 记录操作日志
      await this.logUserAction(external_userid, `state_updated_to_${state}`);

      return {
        success: true,
        data: data[0],
        external_userid,
        state
      };

    } catch (err) {
      console.error('❌ 保存用户数据异常:', err);
      return { success: false, error: err.message };
    }
  }

  // 获取用户数据
  async getUser(external_userid) {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .select('*')
        .eq('external_userid', external_userid)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // 用户不存在
          return {
            success: false,
            message: '用户不存在',
            shouldCreateNew: true
          };
        }
        console.error('❌ 获取用户数据失败:', error);
        return { success: false, error: error.message };
      }

      // 记录访问日志
      await this.logUserAction(external_userid, 'data_accessed');

      return {
        success: true,
        data: data
      };

    } catch (err) {
      console.error('❌ 获取用户数据异常:', err);
      return { success: false, error: err.message };
    }
  }

  // 获取所有用户（管理用）
  async getAllUsers() {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .select('external_userid, state, user_name, main_document_id, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ 获取所有用户失败:', error);
        return { success: false, error: error.message };
      }

      return {
        success: true,
        data: data,
        count: data.length
      };

    } catch (err) {
      console.error('❌ 获取所有用户异常:', err);
      return { success: false, error: err.message };
    }
  }

  // 删除用户
  async deleteUser(external_userid) {
    try {
      const { error } = await supabase
        .from(this.tableName)
        .delete()
        .eq('external_userid', external_userid);

      if (error) {
        console.error('❌ 删除用户失败:', error);
        return { success: false, error: error.message };
      }

      console.log(`✅ 用户删除成功: ${external_userid}`);
      return {
        success: true,
        external_userid
      };

    } catch (err) {
      console.error('❌ 删除用户异常:', err);
      return { success: false, error: err.message };
    }
  }

  // 记录用户操作日志
  async logUserAction(external_userid, action) {
    try {
      const { error } = await supabase
        .from('user_access_log')
        .insert({
          external_userid,
          action,
          timestamp: new Date().toISOString()
        });

      if (error) {
        console.error('❌ 记录用户操作失败:', error);
      }
    } catch (err) {
      console.error('❌ 记录用户操作异常:', err);
    }
  }

  // 获取用户操作记录
  async getUserAccessLog(external_userid, limit = 10) {
    try {
      const { data, error } = await supabase
        .from('user_access_log')
        .select('*')
        .eq('external_userid', external_userid)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('❌ 获取用户操作记录失败:', error);
        return { success: false, error: error.message };
      }

      return {
        success: true,
        data: data
      };

    } catch (err) {
      console.error('❌ 获取用户操作记录异常:', err);
      return { success: false, error: err.message };
    }
  }

  // 统计信息
  async getStats() {
    try {
      // 获取用户总数
      const { count: totalUsers, error: countError } = await supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true });

      if (countError) {
        throw countError;
      }

      // 获取各状态用户数量
      const { data: stateStats, error: stateError } = await supabase
        .from(this.tableName)
        .select('state')
        .neq('state', null);

      if (stateError) {
        throw stateError;
      }

      // 统计各状态数量
      const stateCounts = stateStats.reduce((acc, user) => {
        acc[user.state] = (acc[user.state] || 0) + 1;
        return acc;
      }, {});

      // 获取今日新增用户
      const today = new Date().toISOString().split('T')[0];
      const { count: todayNewUsers, error: todayError } = await supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today);

      if (todayError) {
        throw todayError;
      }

      return {
        success: true,
        stats: {
          total_users: totalUsers,
          today_new_users: todayNewUsers,
          state_distribution: stateCounts,
          last_updated: new Date().toISOString()
        }
      };

    } catch (err) {
      console.error('❌ 获取统计信息异常:', err);
      return { success: false, error: err.message };
    }
  }
}

// 创建全局实例
const supabaseStore = new SupabaseStore();

module.exports = supabaseStore; 
