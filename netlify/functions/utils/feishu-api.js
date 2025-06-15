/**
 * 飞书API客户端工具类
 */
class FeishuAPI {
  constructor(appId, appSecret) {
    this.appId = appId;
    this.appSecret = appSecret;
    this.baseURL = 'https://open.feishu.cn/open-apis';
    this.accessToken = null;
    this.tokenExpires = 0;
  }

  /**
   * 获取访问令牌
   */
  async getAccessToken() {
    try {
      // 检查token是否还有效
      if (this.accessToken && Date.now() < this.tokenExpires) {
        return this.accessToken;
      }

      const response = await fetch(`${this.baseURL}/auth/v3/tenant_access_token/internal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          app_id: this.appId,
          app_secret: this.appSecret
        })
      });

      if (!response.ok) {
        throw new Error(`获取访问令牌失败: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.code !== 0) {
        throw new Error(`获取访问令牌失败: ${data.msg}`);
      }

      this.accessToken = data.tenant_access_token;
      // 提前5分钟过期
      this.tokenExpires = Date.now() + (data.expire - 300) * 1000;
      
      return this.accessToken;
      
    } catch (error) {
      console.error('获取访问令牌失败:', error);
      throw error;
    }
  }

  /**
   * 发送消息到指定用户
   * @param {string} receiverId - 接收者ID
   * @param {string} msgType - 消息类型 (text, rich_text, etc.)
   * @param {object} content - 消息内容
   * @param {string} receiveIdType - 接收者ID类型 (user_id, email, open_id, union_id)
   */
  async sendMessage(receiverId, msgType, content, receiveIdType = 'open_id') {
    try {
      const token = await this.getAccessToken();
      
      const response = await fetch(`${this.baseURL}/im/v1/messages?receive_id_type=${receiveIdType}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          receive_id: receiverId,
          msg_type: msgType,
          content: JSON.stringify(content)
        })
      });

      if (!response.ok) {
        throw new Error(`发送消息失败: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.code !== 0) {
        throw new Error(`发送消息失败: ${data.msg}`);
      }

      return data.data;
      
    } catch (error) {
      console.error('发送消息失败:', error);
      throw error;
    }
  }

  /**
   * 回复消息
   * @param {string} messageId - 要回复的消息ID
   * @param {string} msgType - 消息类型
   * @param {object} content - 消息内容
   */
  async replyMessage(messageId, msgType, content) {
    try {
      const token = await this.getAccessToken();
      
      const response = await fetch(`${this.baseURL}/im/v1/messages/${messageId}/reply`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          msg_type: msgType,
          content: JSON.stringify(content)
        })
      });

      if (!response.ok) {
        throw new Error(`回复消息失败: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.code !== 0) {
        throw new Error(`回复消息失败: ${data.msg}`);
      }

      return data.data;
      
    } catch (error) {
      console.error('回复消息失败:', error);
      throw error;
    }
  }

  /**
   * 获取用户信息
   * @param {string} userId - 用户ID
   * @param {string} userIdType - 用户ID类型
   */
  async getUserInfo(userId, userIdType = 'open_id') {
    try {
      const token = await this.getAccessToken();
      
      const response = await fetch(`${this.baseURL}/contact/v3/users/${userId}?user_id_type=${userIdType}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`获取用户信息失败: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.code !== 0) {
        throw new Error(`获取用户信息失败: ${data.msg}`);
      }

      return data.data.user;
      
    } catch (error) {
      console.error('获取用户信息失败:', error);
      throw error;
    }
  }

  /**
   * 创建文本消息内容
   * @param {string} text - 文本内容
   */
  createTextContent(text) {
    return { text };
  }

  /**
   * 创建富文本消息内容
   * @param {object} richText - 富文本内容
   */
  createRichTextContent(richText) {
    return richText;
  }

  /**
   * 创建卡片消息内容
   * @param {object} card - 卡片内容
   */
  createCardContent(card) {
    return card;
  }
}

module.exports = FeishuAPI; 