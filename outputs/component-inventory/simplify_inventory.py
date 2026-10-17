"""Build the curated public-facing table; keep exact package evidence separately."""
import html
import json
from pathlib import Path

out = Path(__file__).resolve().parent
evidence = json.loads((out / 'component-evidence.json').read_text(encoding='utf-8'))
dependencies = evidence['direct_dependencies']
rows = []

def add(name, package, provider, purpose, module='frontend', license=None):
    source = next(r for r in dependencies if r['name'] == package and r['module'] == module)
    rows.append([name, source['version'], provider, license or source['license'], purpose])

add('React', 'react', 'React 开源社区（Meta 发起）', '前端应用界面开发及交互组件渲染')
add('Paper.js', 'paper', 'Paper.js 项目', '二维画布、矢量图形绘制与编辑')
add('React Flow', 'reactflow', 'xyflow / React Flow 项目', '可视化工作流画布、节点连接与流程编排')
add('Three.js', 'three', 'Three.js 开源社区', '三维模型加载、场景构建、材质灯光及渲染')
add('React Three Fiber', '@react-three/fiber', 'Poimandres 开源社区', 'React 界面与三维场景集成')
add('Three GPU Pathtracer', 'three-gpu-pathtracer', 'Garrett Johnson / 开源社区', '三维场景 GPU 路径追踪渲染')
add('Zustand', 'zustand', 'Poimandres 开源社区', '画布、工作流和界面状态管理')
add('Tiptap', '@tiptap/react', 'Tiptap 开源项目', '富文本内容编辑及图片、链接等编辑能力')
add('AG PSD', 'ag-psd', 'Agamnentzar / 开源社区', 'Photoshop PSD 文件解析与生成')
add('WebAV', '@webav/av-cliper', 'WebAV 开源项目', '浏览器音视频剪辑、合成与 MP4 导出', license='上游 MIT；该版本包内未声明，待核验')
add('IMG.LY Background Removal', '@imgly/background-removal', 'IMG.LY GmbH', '浏览器端图片背景移除及服务端不可用时的降级处理', license='AGPL v3')
add('IMG.LY Background Removal Node', '@imgly/background-removal-node', 'IMG.LY GmbH', '服务端图片背景移除与工作线程处理', module='backend', license='AGPL v3')
add('ONNX Runtime', 'onnxruntime-node', 'Microsoft', '服务端图片背景移除所需的 ONNX 模型推理', module='backend')
add('Sharp', 'sharp', 'Sharp 开源项目', '服务端图像缩放、格式转换及图像处理', module='backend')
add('Google Gen AI', '@google/genai', 'Google', '服务端 Google Gemini 多模态 AI 接口调用', module='backend')
add('阿里云内容安全审核 SDK', '@alicloud/green20220302', '阿里云', '对接阿里云文本与图片内容安全审核服务', module='backend')
add('阿里云短信 SDK', '@alicloud/sms-sdk', '阿里云', '短信验证码及短信通知服务对接', module='backend')
add('AWS SDK for S3', '@aws-sdk/client-s3', 'Amazon Web Services', 'S3 兼容对象存储访问；配套同版本上传及预签名组件实现文件上传与访问地址签发', module='backend')
add('阿里云 OSS SDK', 'ali-oss', '阿里云', '视频水印处理流程中的 OSS 文件访问与存储对接', module='backend')
add('腾讯云 COS SDK', 'cos-nodejs-sdk-v5', '腾讯云', '腾讯语音服务流程中的 COS 对象存储对接', module='backend')
add('支付宝 SDK', 'alipay-sdk', '支付宝开放平台', '支付宝支付、充值及交易接口对接', module='backend')
add('微信支付 SDK', 'wechatpay-node-v3', 'wechatpay-node-v3 开源项目（非官方）', '微信支付 V3 支付、充值及交易接口对接', module='backend')
add('NestJS', '@nestjs/core', 'NestJS 项目', '后端应用框架、模块组织、依赖注入与接口服务', module='backend')
add('Fastify', 'fastify', 'Fastify 开源社区', '后端 HTTP 请求处理与接口服务运行', module='backend')
add('Prisma', '@prisma/client', 'Prisma', 'PostgreSQL 数据访问、业务数据持久化及数据库模型管理', module='backend')
add('Socket.IO', 'socket.io', 'Socket.IO 开源项目', '前后端实时通信、协作事件与消息推送；客户端版本同为 4.8.3', module='backend')
add('ioredis', 'ioredis', 'ioredis 开源项目', 'Redis 连接、缓存及共享状态访问', module='backend')
add('OpenTelemetry', '@opentelemetry/sdk-node', 'OpenTelemetry 项目', '服务端自动埋点、调用链追踪及遥测数据上报；版本为 Node SDK 版本', module='backend')

target = out / 'Tanva-开源及第三方组件清单.html'
previous = target.read_text(encoding='utf-8')
style = previous.split('<style>', 1)[1].split('</style>', 1)[0]
header = ['名称及版本', '来源/提供方', '许可协议/授权方式', '在本作品中的用途']
table = '<table><colgroup><col style="width:25%"><col style="width:22%"><col style="width:20%"><col style="width:33%"></colgroup><thead><tr>'
table += ''.join('<th>' + h + '</th>' for h in header) + '</tr></thead><tbody>'
for name, version, provider, license, purpose in rows:
    table += '<tr>' + ''.join('<td>' + html.escape(value).replace('\n', '<br>') + '</td>' for value in [name+'\n'+version, provider, license, purpose]) + '</tr>'
table += '</tbody></table>'
notes = [
    '说明：本表选列项目核心第三方及开源组件，名称采用库或产品的常用名称。同一库的子组件及辅助依赖不逐项展开；开发、编译、类型声明等工具不列入。版本依据当前 npm 锁文件，不包含 tgAgent。',
    'SDK 的开源许可与云服务合同分别适用；表中许可不代表已取得云服务、模型或商业软件授权。IMG.LY 抠图库采用 AGPL v3。WebAV 当前上游为 MIT，但 1.2.8 包内未声明许可，保留版本许可核验说明。',
    '核对日期：2026 年 10 月 16 日。精确包名、原始版本及代码引用位置保留在 component-evidence.json，供技术核查使用。',
]
target.write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Tanva 开源及第三方组件清单</title><style>'+style+'</style><body><button onclick="window.print()">打印或另存为 PDF</button><h1>表 6-3&nbsp; 开源及第三方组件清单</h1>'+table+'<div class="notes">'+''.join('<p>'+html.escape(n)+'</p>' for n in notes)+'</div></body></html>', encoding='utf-8')
(out/'core-components.json').write_text(json.dumps({'columns':['名称','版本','来源/提供方','许可协议/授权方式','在本作品中的用途'],'rows':rows}, ensure_ascii=False, indent=2),encoding='utf-8')
assert len(rows)==28
assert all('@' not in r[0] and '/' not in r[0] for r in rows)
assert any(r[0]=='阿里云内容安全审核 SDK' for r in rows)
print('Updated core table:',len(rows),'rows')
