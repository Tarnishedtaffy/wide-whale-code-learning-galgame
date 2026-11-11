#!/usr/bin/env node
/*
 * 构建「前端直连」演示版：把中转地址与 key 混淆后内联进 HTML。
 *
 * 重要限制：
 *   1. 只能用于允许跨域的中转（如你的 new-api），智谱官方接口无 CORS，浏览器调不通。
 *   2. 中转是 HTTP 明文，页面若部署在 HTTPS 站点会被浏览器按混合内容拦截。
 *   3. 混淆只提高提取门槛，不能真正保护密钥。任何拿到此文件的人都能还原出 key。
 *
 * 用法（不要提交产物，也不要提交本命令里的 key）：
 *   RELAY_URL='http://你的中转:3000' RELAY_KEY='你的中转key' node deploy/build-demo.mjs
 * 产物：exports/mnk-demo-live.html
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const SRC = "study-loop/index.html";
const OUT = "exports/mnk-demo-live.html";

const url = (process.env.RELAY_URL || "").replace(/\/+$/, "");
const key = process.env.RELAY_KEY || "";
const model = process.env.RELAY_MODEL || "mnk-chat";
if (!url || !key) {
  console.error("缺少 RELAY_URL 或 RELAY_KEY，未生成。");
  process.exit(1);
}

// 混淆 v2：payload → XOR(k1) → base64 → XOR(k2) → base64 → 切 4 段乱序。
// k1/k2 每次构建随机生成，产物每次都不同。防 Ctrl+F / 随手看源码，不防有意逆向。
function encode(payload) {
  const k1 = crypto.randomInt(1, 256);
  const k2 = crypto.randomInt(1, 256);
  const x1 = Buffer.from(payload, "utf8");
  for (let i = 0; i < x1.length; i++) x1[i] ^= k1;
  const b1 = x1.toString("base64");
  const x2 = Buffer.from(b1, "utf8");
  for (let i = 0; i < x2.length; i++) x2[i] ^= k2;
  const b2 = x2.toString("base64");
  const n = Math.ceil(b2.length / 4);
  const parts = [b2.slice(0, n), b2.slice(n, 2 * n), b2.slice(2 * n, 3 * n), b2.slice(3 * n)];
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { segs: order.map((i) => parts[i]), order, k1, k2 };
}
const { segs, order, k1, k2 } = encode(`${url}\n${key}`);

const prelude = `
<script>
(function(){
  var _0x=["${segs[0]}","${segs[1]}","${segs[2]}","${segs[3]}"],_0x1=[${order.join(",")}],_0x2=${k1}^0,_0x3=${k2}^0;
  var _parts=[];
  for(var p=0;p<_0x1.length;p++)_parts[_0x1[p]]=_0x[p];
  var _0x4=_parts.join("");
  var _0x5=atob(_0x4),_0x6="";
  for(var i=0;i<_0x5.length;i++)_0x6+=String.fromCharCode(_0x5.charCodeAt(i)^_0x3);
  var _0x7=atob(_0x6),_0x8="";
  for(var i=0;i<_0x7.length;i++)_0x8+=String.fromCharCode(_0x7.charCodeAt(i)^_0x2);
  var _0x9=_0x8.split("\\n"),U=_0x9[0],K=_0x9[1];
  if(!U||!K)return;
  var F=window.fetch;
  window.fetch=function(u,o){
    if(typeof u==="string"&&u.indexOf("/v1/chat/completions")>=0){
      o=o||{};
      o.headers=Object.assign({},o.headers||{},{Authorization:"Bearer "+K});
      u=U+"/v1/chat/completions";
    }
    return F.call(this,u,o);
  };
})();
</script>`;

let html = fs.readFileSync(SRC, "utf8");
if (!html.includes('mode: "local",')) {
  console.error('未找到 mode: "local"，页面可能已被改动，已中止。');
  process.exit(1);
}
html = html.replace('mode: "local",', 'mode: "proxy",');
html = html.split('model: "mnk-chat"').join(`model: ${JSON.stringify(model)}`);
// 中转侧多为推理型模型，首字延迟常在 5-8s，演示版放宽超时避免误回落
html = html.replace("timeout: 10000,", "timeout: 25000,");
html = html.replace("</body>", prelude + "\n</body>");
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);

console.log(`已生成 ${OUT}`);
console.log(`大小：${fs.statSync(OUT).size} 字节`);
console.log(`目标：${U_SAFE(url)}（key 长度 ${key.length}，已混淆内联）`);
function U_SAFE(u) {
  return u.replace(/\/\/([^/:]+)/, "//$1");
}
