# 后端模块：对象存储与素材（backend-oss）

## 作用
- 提供上传凭证/素材代理/视频帧等能力，为前端素材管理、项目缩略图、视频拆帧等提供支持。
- 支持两种上传模式（按机器配置切换）：
  - `tos`：火山引擎 TOS / S3 预签名直传（默认）
  - `local`：写入本机磁盘，由 nginx 静态托管（物理机常见）

## 关键文件
- `backend/src/oss/oss.service.ts`：存储抽象、TOS client、本地落盘、public URL、允许域名白名单
- `backend/src/oss/uploads.controller.ts`：`/uploads/*`（含 `storage-mode` / `file`）
- `backend/src/oss/assets.controller.ts`：`/assets/*`（local 模式可直接读盘）
- `backend/src/oss/video-frames.controller.ts`：`/video-frames/*`
- `backend/src/oss/video-gif.controller.ts`：`/video-gif/*`

## 配置项

### 模式开关
- `UPLOAD_MODE=tos|local`（也兼容 `OSS_UPLOAD_MODE`）
  - 默认 `tos`
  - 物理机 nginx 静态目录：设为 `local`

### TOS 模式
- `OSS_REGION`、`OSS_BUCKET`
- `OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET`
- `OSS_CDN_HOST`（可选）、`OSS_ENDPOINT`（可选）
- `ALLOWED_PROXY_HOSTS`：额外允许代理的域名（逗号分隔）

### Local 模式（nginx html）
- `LOCAL_UPLOAD_ROOT`：落盘根目录，须与 nginx 静态根一致  
  例：`/usr/share/nginx/html` 或 `/var/www/html`
- `LOCAL_UPLOAD_PUBLIC_BASE_URL`：对外访问前缀（无尾斜杠）  
  例：`https://your-domain.com`  
  对象 key `uploads/a.png` → 公开 URL `https://your-domain.com/uploads/a.png`

### 前端配套
- `VITE_UPLOAD_MODE=local`（可选；后端 `presign.mode=local` 也会自动走中转）
- `VITE_ASSET_PUBLIC_BASE_URL`：与 `LOCAL_UPLOAD_PUBLIC_BASE_URL` 保持一致  
  这样历史 TOS 全路径（`https://xxx.volces.com/uploads/...`）会按 **同一 key** 重写到本机 nginx，新旧路径兼容。

## 物理机部署要点

1. 将历史 TOS 对象按 **原 key 路径** 同步到 `LOCAL_UPLOAD_ROOT`（例如 `uploads/`、`projects/`、`videos/`、`ai/`、`templates/`）。
2. nginx 直接托管该目录，例如：

```nginx
server {
  listen 80;
  server_name your-domain.com;
  root /usr/share/nginx/html;
  client_max_body_size 512m;

  location / {
    try_files $uri $uri/ /index.html;
  }

  # 后端 API
  location /api/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_request_buffering off;
  }
}
```

3. 后端 `.env`：

```env
UPLOAD_MODE=local
LOCAL_UPLOAD_ROOT=/usr/share/nginx/html
LOCAL_UPLOAD_PUBLIC_BASE_URL=https://your-domain.com
```

4. 前端 `.env`：

```env
VITE_UPLOAD_MODE=local
VITE_ASSET_PUBLIC_BASE_URL=https://your-domain.com
```

云上另一台机器继续 `UPLOAD_MODE=tos` + OSS 凭证即可，互不影响。

## 注意事项
- `allowedPublicHosts()` 内置了部分常见 AI/静态资源域名白名单；是否需要更严格以产品要求为准。
- `POST /api/video-gif/convert` 保留同步转换；线上默认更适合走 `POST /api/video-gif/convert-async` + `GET /api/video-gif/task/:taskId`，避免长时间 `ffprobe` / `ffmpeg` / OSS 上传占用请求导致 `504`。
- `video-gif` 转换链路走服务端 `ffprobe` + `ffmpeg` pipeline：先校验 `videoUrl` 与 host 白名单，再探测总时长，最后按 `fps` / `width` / `startSeconds` / `durationSeconds` 生成 GIF 并上传 OSS；运行环境必须安装 `ffprobe` 和 `ffmpeg`。
- 当前异步任务状态存储是进程内内存 Map，服务重启后未完成任务会丢失；如果后续要做更稳的线上方案，建议迁到 Redis / DB。
- 设计 JSON 仍只应持久化远程 URL / key；local 模式返回的 `https://域名/key` 或 key 均可。
