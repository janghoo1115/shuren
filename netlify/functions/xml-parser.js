/**
 * 简单的XML解析器，用于解析企业微信消息
 */
function parseXML(xmlString) {
  return new Promise((resolve, reject) => {
    try {
      // 简单的XML解析实现
      const result = { xml: {} };
      
      // 移除XML声明和换行符
      const cleanXml = xmlString.replace(/<\?xml[^>]*\?>/g, '').trim();
      
      // 匹配所有标签
      const tagRegex = /<([^>]+)>([^<]*)<\/\1>/g;
      let match;
      
      while ((match = tagRegex.exec(cleanXml)) !== null) {
        const tagName = match[1];
        const tagValue = match[2];
        
        // 处理CDATA
        const cdataMatch = tagValue.match(/^<!\[CDATA\[(.*)\]\]>$/);
        const value = cdataMatch ? cdataMatch[1] : tagValue;
        
        if (!result.xml[tagName]) {
          result.xml[tagName] = [];
        }
        result.xml[tagName].push(value);
      }
      
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 构建XML字符串
 */
function buildXML(obj) {
  let xml = '<xml>';
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      // 检查是否需要CDATA
      if (value.includes('<') || value.includes('&') || value.includes('"')) {
        xml += `<${key}><![CDATA[${value}]]></${key}>`;
      } else {
        xml += `<${key}>${value}</${key}>`;
      }
    } else {
      xml += `<${key}>${value}</${key}>`;
    }
  }
  
  xml += '</xml>';
  return xml;
}

module.exports = {
  parseXML,
  buildXML
}; 
