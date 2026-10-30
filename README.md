# 拾光工坊 · Creative Studio

基于 Next.js、Spring Boot 和 MySQL 的异步图片制作网站。用户选择模板、上传图片并提交任务后，可以继续使用网站；Java 后台依次执行素材检查、图片生成、结果整理，前端从服务端恢复和跟踪个人任务。

**交付版本：v0.6.1｜提交说明修订：2026-10-30｜交付形式：源码仓库／完整源码压缩包。**

源码仓库：[zyCurtain/creative-studio](https://github.com/zyCurtain/creative-studio)。仓库根目录即下文所述的项目目录。

本项目以题目要求的可控模拟生成器完成核心验收，**不需要真实 API Key 或付费服务**。账户登录、个人模板管理、作品删除及阿里云百炼接入为扩展能力，不替代模拟制作流程。默认本地部署，不要求公网服务。

## 1. 快速启动

### 环境与启动命令

- Docker Engine 与 Docker Compose v2；Windows/macOS 可使用 Docker Desktop，Windows 选择 Linux containers。
- 本地验证环境使用 Compose `2.32.4-desktop.1`。扩展测试配置使用 `!override`，需要支持该语法的 Compose v2。
- 首次构建需联网下载基础镜像、npm 和 Maven 依赖。无需在宿主机安装 Node.js、Java、Maven 或 MySQL。
- 默认使用宿主机 `3100` 端口。以下命令均在解压后的 `creative-studio` 目录，即 `compose.yaml` 所在目录执行。

```sh
docker compose up --build -d --wait --wait-timeout 300
docker compose ps
```

三个服务均为 `healthy` 后，打开 **[http://localhost:3100](http://localhost:3100)**。首次启动会自动创建数据库表并写入六个系统模板，无需手动导入 SQL，也无需预置账户。

默认配置即可运行。需要调整参数时，将 [.env.example](.env.example) 复制为本地 `.env` 后修改。模拟验收须满足：`DASHSCOPE_API_KEY` 为空、`SIMULATION_ENABLED=true`；请同时检查当前终端环境，因为终端中的同名变量会覆盖 `.env`。制作页显示当前生成模式，也可查看 [模式接口](http://localhost:3100/api/generation/config)，模拟模式应返回 `mode: "SIMULATION"`。

如果当前终端已经设置了 Key，可先清空当前会话变量，再执行启动命令：

```powershell
# PowerShell
$env:DASHSCOPE_API_KEY = ''
$env:SIMULATION_ENABLED = 'true'
```

```sh
# Bash / zsh
export DASHSCOPE_API_KEY=''
export SIMULATION_ENABLED=true
```

评估者只需运行 Docker 命令，构建、依赖安装、测试和应用执行都在容器中完成。`start.ps1` 是 Windows 开发便利脚本，会额外读取用户／系统级 Key，**不是提交验收的必需入口**。

### 最短体验路径

1. 进入「山野来信」，上传项目自带的 [demo/sample-input.png](demo/sample-input.png)。
2. 点击「开始制作」，观察排队、当前阶段和终态；模拟模式默认每阶段延迟 2 秒。
3. 再次提交以创建第二个任务，刷新页面后检查任务记录是否恢复。
4. 成功后点击结果预览；在「我的作品」查看跨模板的个人历史。

## 2. 功能范围与需求对应

| 需求 | 当前实现与阅读入口 |
| --- | --- |
| R-01 技术栈与职责 | Next.js App Router / React / TypeScript；Java 提供全部业务接口，Spring Boot + MyBatis 读写 MySQL。Next.js 仅提供页面和同源 API 转发。 |
| R-02 模板列表 | 三个系统分类、六个模板，涵盖单图和双图；模板由 Java 查询数据库返回，支持分类筛选和详情跳转。 |
| R-03 上传与校验 | 独立上传位、预览、替换、移除、上传反馈；前后端校验数量、JPEG/PNG 格式和 5 MiB 大小，后端校验图片内容及素材归属。 |
| R-04～R-06 后台任务 | 事务提交后派发到有界线程池；三个阶段独立记录，支持指定失败阶段和耗时，失败停止后续步骤。见 [TaskService](backend/src/main/java/com/example/studio/TaskService.java)、[Pipeline](backend/src/main/java/com/example/studio/Pipeline.java)。 |
| R-07～R-08 前端异步状态 | 多任务独立跟踪，查询异常与执行失败分离；终态停止轮询，页面离开／身份切换取消旧请求，按任务版本防止旧结果覆盖。见 [use-tasks](frontend/src/lib/use-tasks.ts)。 |
| R-09 历史恢复 | MySQL 持久化、创建时间和结果／错误展示，刷新恢复未完成任务；成功结果支持图片预览。 |
| R-10 身份管理 | 访客会话、账户注册／登录／退出、访客记录绑定、个人素材和任务隔离。 |
| R-11 页面与交互 | 模板广场、制作页、历史页；桌面布局、小屏适配、加载／空态／错误反馈、输入标签和原生对话框。 |
| R-12 CI 与测试 | 保留 [GitHub Actions](.github/workflows/ci.yml)，push / pull_request 触发容器构建、静态检查、单元及集成测试。 |
| R-13～R-14 工程交付 | 源码、依赖锁文件、Flyway 迁移、种子数据、本地示例图片、配置示例、README、Dockerfile 和 Compose 均随包交付。 |

题外扩展：注册用户可新建／删除自己的私有模板；用户可删除已结束的制作记录；可选接入百炼真实生成。模板编辑、公开分享、任务重做、支付和会员功能未实现。

## 3. 架构与关键实现

```text
浏览器 http://localhost:3100
  └─ Next.js frontend:3000
       ├─ 页面、上传交互、任务轮询
       └─ /api/* 同源转发 → Spring Boot backend:8080
                              ├─ MyBatis → MySQL db:3306
                              ├─ 文件读写 → media_data 卷
                              └─ 有界线程池 → 三阶段流水线
                                                 └─ 模拟生成 / 可选百炼
```

Compose 内部通过服务名互访。前端的 `BACKEND_URL` 为 `http://backend:8080`，Java 的数据库连接指向 `db:3306/studio`。只有前端端口映射到宿主机 `127.0.0.1:3100`；Java 和 MySQL 未发布宿主机端口。默认地址请使用 `localhost`，写请求会检查 Origin。

### 任务状态与执行边界

```text
整体状态：QUEUED → RUNNING → SUCCEEDED / FAILED
执行阶段：CHECK_ASSETS → GENERATE → PACKAGE_RESULT
阶段状态：PENDING / RUNNING / SUCCEEDED / FAILED / SKIPPED
```

- 创建接口完成参数校验和记录写入后派发后台任务，返回 HTTP 202 与任务 ID，不等待制作完成。响应中的任务可能已被工作线程推进，应以服务端状态为准。
- 默认 2 个工作线程、20 个排队位置。队列满时任务记录为 `FAILED / EXECUTOR_REJECTED`；不会退回 HTTP 请求线程执行。
- 素材检查确认服务端文件可读；生成阶段写入临时结果；结果整理将文件转存为任务独立结果并记录成功状态。
- 每个阶段有独立状态和时间。阶段失败会终止后续执行，未执行阶段标记 `SKIPPED`。查询接口只读状态，不驱动处理。
- 模拟模式使用 Java2D 程序绘制的预置风格图，不真正处理上传照片或执行自定义提示词，页面明确标注模拟结果。
- 前端在有未完成任务时每轮结束后约 2 秒继续查询，每批最多 50 个任务；全部结束后停止轮询。刷新时重新加载历史和活动任务，任务按 ID 去重、按 `version` 合并。
- 请求失败仅显示查询异常并保留已知记录，不能把后台任务改成失败。提交请求超时也可能已被受理，应先刷新确认，前端不自动重新提交。

### 身份与隔离

首次访问通过 `POST /api/session` 创建访客，随机令牌写入 HttpOnly、SameSite=Lax Cookie，数据库仅存令牌摘要，会话有效期 30 天。注册将当前访客升级为账户，原有作品与素材保留；登录已有账户后，用户可显式绑定当前待绑定的访客记录。

邮箱作为登录名，密码使用 BCrypt 摘要存储。注册／登录会轮换会话令牌；退出撤销当前会话，有未绑定访客时恢复该访客，否则创建新访客。跨标签页通过 BroadcastChannel 同步身份切换并清理旧页面数据。

服务端以会话确定归属，不接受客户端指定 ownerId。私有模板、素材、任务和结果均检查归属。清除 Cookie 后，账户作品可重新登录查看；未注册且未绑定的访客记录无法找回。

### 数据与初始化

| 持久化位置 | 内容 |
| --- | --- |
| `mysql_data` 卷 | 身份、账户、会话、模板、素材元数据、任务、任务素材关系及阶段状态 |
| `media_data` 卷，后端 `/data` | 上传文件、模拟图、临时结果和最终结果 |
| 后端 classpath `template-covers/` | 六张随应用打包的系统 JPEG 封面及来源元数据 |

[Flyway 迁移](backend/src/main/resources/db/migration) 按 V1～V6 顺序自动执行：V1 基础表与系统模板；V2 账户及会话；V3 作品记录删除；V4 生成来源；V5 私有模板；V6 模板删除。已有数据库只执行未应用的迁移，不应修改已应用的迁移文件。

删除作品记录后，该记录与结果接口不可访问；删除私有模板后，该模板不能接受新任务，但旧作品与已受理任务保留。两者均为逻辑删除，界面不提供恢复，也不会立即清除底层文件。

## 4. 技术版本与目录

| 层 | 当前配置 |
| --- | --- |
| 前端 | Next.js 16.4.3、React 19.3.1、TypeScript 5.9.3 |
| 前端检查 | ESLint 9.39.5、Vitest 5.0.5、Testing Library 16.3.0 |
| 后端 | Java 21、Spring Boot 3.5.16、MyBatis Starter 3.0.5 |
| 构建与运行 | Maven 3.9.9、Node.js 22、Eclipse Temurin 21 JRE |
| 数据库 | MySQL 8.4.7；Flyway、JUnit 等版本由 Spring Boot BOM 管理 |

前端通过 `package-lock.json` 固定依赖解析结果，后端使用 `pom.xml` 与 Spring Boot 依赖管理。基础镜像使用版本标签，未绑定 digest，不承诺逐字节重现。前后端 Dockerfile 均采用构建／运行两阶段，运行容器使用非 root 用户。

```text
creative-studio/
├─ frontend/                  Next.js 页面、API 转发、组件、状态逻辑及测试
├─ backend/
│  ├─ src/main/java/          接口、身份、Mapper、流水线、图片生成与存储
│  ├─ src/main/resources/
│  │  ├─ db/migration/        V1～V6 数据结构及种子迁移
│  │  └─ template-covers/     本地摄影封面与 credits.json
│  └─ src/test/               Java 单元测试
├─ tests/                     真实服务接口与隔离故障验收脚本
├─ demo/sample-input.png      可直接上传的本地示例
├─ docs/                      分阶段验收记录、截图、素材来源
├─ .github/workflows/ci.yml   容器内 CI 检查
├─ .env.example               无真实凭据的配置示例
├─ compose.yaml              服务、网络、健康检查与持久化卷
└─ start.ps1                  Windows 开发便利入口，验收无需执行
```

## 5. 配置与可选真实生成

| 配置项 | 默认值 | 含义 |
| --- | --- | --- |
| `WEB_PORT` | `3100` | 宿主机前端端口；Compose 同时生成对应的 `PUBLIC_ORIGIN` |
| `MYSQL_PASSWORD` | `studio-local-demo` | 本地演示应用数据库密码 |
| `MYSQL_ROOT_PASSWORD` | `studio-root-local-demo` | 本地演示数据库初始化密码 |
| `SIMULATION_ENABLED` | `true`（Compose） | 允许任务请求携带开发用失败／延迟控制；不决定是否调用真实模型 |
| `WORKER_COUNT` / `QUEUE_CAPACITY` | `2` / `20` | 工作线程数／排队容量 |
| `SECURE_COOKIE` | `false` | 本地 HTTP 使用；HTTPS 部署时需调整 |
| `DASHSCOPE_API_KEY` | 空 | 空白时模拟，非空时调用百炼 |
| `DASHSCOPE_IMAGE_MODEL` | `qwen-image-2.0-pro` | 可选真实生成模型 |
| `DASHSCOPE_BASE_URL` | `https://dashscope.aliyuncs.com/api/v1` | 百炼原生接口基础地址 |

`DB_URL`、`DB_USER`、`DB_PASSWORD`、`STORAGE_ROOT` 和 `BACKEND_URL` 已由 Compose 连接到对应容器及卷。MySQL 初始化变量主要作用于空数据卷；修改 `.env` 不会自动修改已有数据库中的账户密码。

真实生成属于可选扩展：Key 只传入 Java 容器，Java 将用户上传的参考图和模板提示词发送给百炼，并将返回图片保存到本地。真实调用失败会保存脱敏错误，不自动改用模拟图，也不自动重试。真实模式拒绝 `simulation` 参数；切换配置后，已有任务的 `generationMode` 不变。

题目验收建议始终使用模拟模式。不要提交 `.env`、真实 Key、数据库备份或个人上传数据；不要将 Key 放入 `NEXT_PUBLIC_*`。真实接口细节及已执行的单图验证见 [百炼接入与验收](docs/百炼接入与验收.md)。

## 6. 可复现验收

### 页面验收

| 场景 | 操作 | 预期 |
| --- | --- | --- |
| 分类与素材 | 切换分类、进入双图模板；上传、替换、移除一张图片 | 分类与模板数量正确；缺图／上传中不能提交，错误有提示 |
| 成功与多任务 | 使用有效图片连续创建两条模拟任务 | 两条记录独立更新，按钮在受理后恢复，完成后可预览 |
| 刷新恢复 | 任务处理中刷新，或离开再进入同一模板 | 从 Java 恢复任务，继续跟踪未结束项 |
| 查询异常 | 有活动任务时在浏览器开发工具切换离线，随后恢复网络并恢复查询 | 显示请求异常，保留记录，不误标任务失败 |
| 身份与绑定 | 访客先制作后注册；另一浏览器登录同一账户；再测试登录已有账户并显式绑定访客记录 | 记录按规则保留／合并，其他账户不能读取 |
| 私有模板 | 登录后新建封面、提示词和双图模板，再删除 | 仅本人可见；删除前有确认，旧作品及在途任务不受影响 |
| 作品删除 | 在「我的作品」删除成功或失败记录 | 终态记录可删除，活动任务不能删除 |

### 指定阶段失败与耗时控制

前提：当前为 `SIMULATION`，且 `SIMULATION_ENABLED=true`。自动覆盖所有阶段的容器脚本见下一节；也可在已打开网站的浏览器开发者工具控制台执行以下示例。示例会上传一张本地系统封面，并创建一条测试任务，不需要手工查找素材 ID：

```js
async function createDemoTask(failAt = 'GENERATE', delayMs = 3000) {
  async function checked(response) {
    if (!response.ok) throw new Error(await response.text());
    return response;
  }
  const config = await (await checked(await fetch('/api/generation/config'))).json();
  if (config.mode !== 'SIMULATION') throw new Error('请先切换为无 Key 的模拟模式');
  await checked(await fetch('/api/session', { method: 'POST' }));
  const cover = await checked(await fetch('/api/templates/travel-postcard/cover'));
  const form = new FormData();
  form.append('file', await cover.blob(), 'demo-cover.jpg');
  const asset = await (await checked(await fetch('/api/assets', {
    method: 'POST', body: form
  }))).json();
  return (await checked(await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      templateId: 'travel-postcard', assetIds: [asset.id],
      simulation: { failAt, delayMs }
    })
  }))).json();
}
await createDemoTask('GENERATE', 3000);
```

`failAt` 可为 `NONE`、`CHECK_ASSETS`、`GENERATE`、`PACKAGE_RESULT`；`delayMs` 为每阶段统一延迟，范围 0～60000 毫秒。将 `failAt` 改为 `NONE` 可观察成功；设为某一阶段时，该阶段失败，后续阶段 `SKIPPED`。到「我的作品」刷新即可看到控制台创建的任务，也可通过 `GET /api/tasks/{id}` 查看阶段明细。

### 容器测试与 CI

```sh
# 两个 Dockerfile 内执行 lint、类型检查、单元测试及生产构建
docker compose build
```

为避免继承真实模型 Key，接口验收使用独立测试栈。确认 `SIMULATION_ENABLED=true`，按顺序执行：

```sh
docker compose -p creative-studio-accounts -f compose.yaml -f tests/accounts.compose.yaml up -d --no-build --wait --wait-timeout 180
docker compose -p creative-studio-accounts -f compose.yaml -f tests/accounts.compose.yaml --profile test run --rm verify
docker compose -p creative-studio-accounts -f compose.yaml -f tests/accounts.compose.yaml --profile test run --rm verify node /tests/accounts.mjs
docker compose -p creative-studio-accounts -f compose.yaml -f tests/accounts.compose.yaml --profile test run --rm verify node /tests/deletion.mjs
docker compose -p creative-studio-accounts -f compose.yaml -f tests/accounts.compose.yaml --profile test run --rm verify node /tests/templates.mjs
# 停止隔离测试服务，保留其测试卷
docker compose -p creative-studio-accounts -f compose.yaml -f tests/accounts.compose.yaml --profile test down
```

该栈复用前一步构建的 `creative-studio-backend` / `creative-studio-frontend` 镜像，显式清空 Key，使用独立数据卷和 `http://127.0.0.1:3101`。脚本创建独立测试账户及任务；不要对存有私人数据的主服务执行故障注入。

CI 在 push / pull_request 时执行镜像构建、四组接口脚本，并用独立 boundary 项目测试队列拒绝和强制终止后的状态收敛；不自动发布。故障注入的详细复现命令见 [可靠性验收](docs/可靠性验收.md)。**下表记录本地验证结果；远程流水线是否通过，以对应提交的 [GitHub Actions 运行记录](https://github.com/zyCurtain/creative-studio/actions) 为准。**

### 已有验证结果与边界

| 检查 | 最近记录与结论 |
| --- | --- |
| 前端静态检查和生产构建 | v0.6.1：ESLint、TypeScript、Next.js 构建通过 |
| 单元测试 | v0.6.1：前端 23 项、后端 20 项通过，共 43 项 |
| 完整制作与模板管理接口 | v0.6.1：`api-smoke.mjs`、`templates.mjs` 通过，包含三个失败阶段、权限及删除期间在途任务完成 |
| 账户与作品删除接口 | v0.6：`accounts.mjs`、`deletion.mjs` 通过；未将其描述为 v0.6.1 重跑结果 |
| 队列满与强制重启 | v0.2：独立故障注入通过，详见历史记录；后续版本未重新执行该故障注入 |
| 浏览器 | 已检查桌面制作、刷新恢复、预览、小屏基础布局；v0.6 检查模板创建，v0.6.1 检查删除入口、确认框和取消行为 |
| 真实模型 | v0.5 实际单图生成成功；双图及自定义提示词请求结构通过模拟 HTTP 测试，未额外执行相应付费效果验收 |

以上为已执行检查的记录，不代表覆盖所有设备、生产安全或大规模并发场景。此次提交说明修订不修改业务代码，不重复声明新的运行结果。

## 7. 主要 API

浏览器通过同源 `/api` 访问。下表路径省略 `/api` 前缀；JSON 接口禁止缓存，图片接口按权限返回文件。私有接口使用 `studio_session` Cookie，内部存储路径、密码／令牌摘要不对外返回。

| 方法与路径 | 输入／响应摘要 |
| --- | --- |
| `POST /session` | 初始化／读取身份；返回 `id, displayName, registered, email, pendingGuest, pendingTasks, pendingAssets` |
| `POST /auth/register` | `{email, displayName, password}`；201 返回身份，保留当前访客记录 |
| `POST /auth/login` | `{email, password}`；返回身份与待绑定计数 |
| `POST /auth/logout` / `POST /auth/bind` | 无业务参数；退出／绑定后返回身份 |
| `GET /generation/config` | `{mode, model}`，不返回 Key |
| `GET /categories` | 当前可见模板的分类数组 |
| `GET /templates?category=…` | 当前可见模板数组 |
| `GET /templates/{id}` | 单模板详情 |
| `POST /templates` | `{title, description, prompt, requiredImageCount, coverAssetId}`；201 返回私有模板，仅注册账户可用 |
| `POST /templates/{id}/delete` | 仅本人私有模板；返回 `{deleted:true}` |
| `GET /templates/{id}/cover` | 系统 JPEG；自定义封面为上传的 JPEG/PNG，需本人身份；已删除模板返回 404 |
| `POST /assets` | multipart 字段 `file`；201 返回 `id, originalName, mimeType, sizeBytes, previewUrl` |
| `GET /assets/{id}/content` | 本人上传的图片 |
| `POST /tasks` | `{templateId, assetIds, simulation?}`；202 返回任务对象，`id` 为任务 ID |
| `GET /tasks/{id}` | `{task, stages}`；阶段含 `stage, status, startedAt, finishedAt` |
| `GET /tasks?templateId=…&page=0` | `{items, hasMore}`；每页 20 条 |
| `GET /tasks/active?templateId=…` | 活动任务数组，上限 1000 |
| `POST /tasks/status-query` | `{taskIds:[…]}`，最多 50 个；返回当前任务数组 |
| `GET /tasks/{id}/result` | 本人成功任务的 PNG 结果 |
| `POST /tasks/{id}/delete` | 仅已结束的本人任务；返回 `{deleted:true}` |

模板主要字段：`id, title, category, description, prompt, custom, coverUrl, coverCredit, requiredImageCount, maxFileSizeBytes, acceptedMimeTypes`。创建模板时名称／介绍／提示词分别限 80／400／1000 字符，素材数为 1 或 2，封面必须引用本人已上传素材。

任务主要字段：`id, templateId, templateTitle, status, currentStage, failedStage, errorCode, errorMessage, resultUrl, generationMode, generationModel, createdAt, updatedAt, version`。时间为 UTC ISO 8601，前端本地化展示；`generationMode` 为 `SIMULATION` 或 `BAILIAN`。

错误通常返回 `{code, message}`，未预期服务端错误另附 `requestId`。常见状态：400 参数无效；401 会话无效；403 账户／来源限制；404 资源不可见或已删除；409 当前状态不允许；413 文件过大；415 图片格式无效；422 素材数量或归属不符合要求。**查询 HTTP 200 且任务 `status=FAILED` 才表示任务执行失败；查询 HTTP 5xx 是请求异常。**

## 8. 部署、停止与回滚

启动依赖按 MySQL 健康 → Java 健康 → 前端启动排列。升级前保存旧源码／镜像，并备份数据库和媒体卷；执行构建启动后，检查 Compose 健康状态、首页和一条模拟制作任务。

```sh
docker compose ps
docker compose logs --tail 100 backend
docker compose logs --tail 100 frontend
docker compose down
```

`down` 保留命名卷，重建容器不会清空账户和作品。**`down -v` 会删除卷，不是普通停止或回滚命令。** 源码压缩包不包含开发机的数据库、账户、上传文件或运行数据卷。

回滚基本流程：

1. 停止对应用写入，保留当前数据库／媒体备份。
2. 使用升级前保存的源码或镜像，在原 Compose 项目名下重建服务，继续挂载对应数据卷。
3. 先确认旧应用是否兼容当前数据库结构；不兼容时，配套恢复升级前的数据库和媒体备份。应用回滚不会自动撤销 Flyway 迁移。
4. 验证健康检查、登录、历史读取和制作流程。恢复旧备份会失去备份后的变更，应在操作前明确该影响。

特别是 v0.2 应用不兼容 V2 之后的账户表结构，不能只回退应用而继续使用新数据库。当前部署定位为本地评估；公网部署另需配置外部入口、HTTPS、数据库凭据、匹配的 `PUBLIC_ORIGIN` 和 Secure Cookie，未提供生产发布平台。

常见排查：端口被占用时调整 `WEB_PORT`；首次下载失败时检查 Docker、npm registry 和 Maven Central 的网络可达性；服务未健康时查看对应容器日志；修改 Key 或运行配置后重新执行 Compose 启动使容器加载新配置。不要将完整容器环境或真实 Key 粘贴到日志／提交材料中。

## 9. 已知限制与工程取舍

- 使用单实例内存队列，未引入 Redis／消息队列。服务启动时将遗留的 `QUEUED/RUNNING` 标为 `FAILED / EXECUTION_INTERRUPTED`，不自动续跑；数据库不可用时不能保证即时记录失败。
- 未实现任务提交幂等、自动重试和断点续跑；这些不是本题必需项。真实模型调用中断后，上游仍可能继续执行，故不自动重试以避免重复计费。
- 文件与数据库不具备跨介质原子事务；异常退出可能留下孤立文件。上传素材和已删除记录对应的文件尚无自动清理机制。
- 历史使用页码分页，持续新增时可能读到重复项，前端按 ID 去重；不是大规模游标分页方案。活动任务最多恢复 1000 条。
- 账户未提供邮件验证、密码找回、限流、多因素认证、所有设备退出或账户删除。邮箱仅作登录标识，建议使用测试邮箱和独立演示密码。
- 模板暂不支持编辑、公开分享或删除后恢复；作品不支持重做。模拟结果不代表真实图片编辑效果，真实模型效果也不保证精确还原文字与版式。
- 已检查桌面与小屏基础交互，未完成真实移动设备／全浏览器矩阵、磁盘满、数据库中断、大规模压力及完整生产安全审计。

## 10. AI 工作流、素材来源与实际投入

### AI 使用说明

本项目使用 Codex 辅助开发。工作过程为：读取原题与参考截图，整理 R-01～R-14 的实施方案；按数据模型、Java 执行流水线、接口、前端状态管理拆解任务；提供当前代码与错误输出进行生成和修改；在 Docker 中运行构建／测试，再通过浏览器和真实服务接口复核。AI 产出经过验证后才纳入交付，不以生成完成代替测试通过。

具体修正示例：处理轮询与分页时发现，切换身份后的旧分页失败可能污染新页面。将请求归属统一到页面生命周期与取消信号，补充迟到响应、分页防重测试，再运行容器检查。新增模板删除时，则让删除与任务受理共享账户锁，并在任务写入前再次校验模板；通过单元测试验证竞态拒绝，通过接口测试验证删除后在途任务仍可完成。

### 来源与复用范围

业务实现未复用现成第三方业务项目。Next.js、React、Spring Boot、MyBatis、Flyway、JUnit、Vitest、Testing Library 等作为框架和测试依赖使用，版本见依赖文件。题目参考图用于布局与交互参考，未复制为业务素材。

六张系统摄影封面下载自 Wikimedia Commons，随源码本地交付，保留作者、来源和各自的 CC BY／CC BY-SA 许可。页面提供署名与许可链接，具体对应关系见 [封面图片来源](docs/封面图片来源.md) 和 [credits.json](backend/src/main/resources/template-covers/credits.json)。缩略图文件未经再次编辑，页面使用 CSS 裁切展示；这些照片不因与代码一起打包而改变原许可。程序绘制的模拟结果与 `demo/sample-input.png` 由本项目生成。

### 实际投入与取舍

任务给定时间为 3 天（72 小时）。整理本提交说明时，提交者报告剩余约 1 天 17 小时（41 小时），即任务已历时约 31 小时。**这是任务经过时间，包含间歇与等待，不是连续编码工时。** 需求讨论、代码阅读、后续扩展与人工复核未逐段计时，无法准确给出净开发工时，以下仅列出有记录的部分时段。

现有记录可核实的工具辅助开发时段：2026-10-29 首轮约 15:08～15:28（约 20 分钟），可靠性补充约 17:36～17:46（约 10 分钟）；不包含此前方案讨论、后续账户／模型／模板迭代及交付整理，也不能据此声称整个项目仅用 30 分钟完成。

有限时间内优先保证异步阶段真实执行、前端状态隔离、个人记录和容器可复现；未为扩展功能引入微服务、消息队列或复杂后台。真实模型和模板管理在核心模拟链路之外实现，评估时可完全不启用真实模型。

## 11. 交付材料与证据索引

仓库及源码包包含完整前后端源码、依赖声明／锁文件、V1～V6 迁移与系统模板数据、Docker 配置、非敏感配置示例、示例图片、CI、测试脚本及文档。不包含 `.env`、依赖目录、构建缓存、真实凭据、开发机数据库或个人素材。仓库提交时，请在提交说明中附上本次上传的完整 commit SHA，以固定验收版本；不要仅用后续可能变化的分支名标识验收版本。

| 材料 | 用途 |
| --- | --- |
| [实施方案](docs/实施方案.md) | 开发前设计与需求分解，作为历史决策参考 |
| [第一阶段验证](docs/验证记录.md)、[可靠性验收](docs/可靠性验收.md) | 初期闭环、请求边界、隔离故障测试及投入记录 |
| [账户与记录验收](docs/账户与记录验收.md) | 注册、绑定、跨账户隔离 |
| [删除与刷新验收](docs/删除与刷新验收.md) | 已结束作品删除、刷新反馈 |
| [百炼接入与验收](docs/百炼接入与验收.md) | 可选模型配置、来源标注与单图真实调用记录 |
| [自定义模板验收](docs/自定义模板验收.md)、[模板删除验收](docs/模板删除验收.md) | 私有模板创建、删除与在途任务保留 |
| [封面图片来源](docs/封面图片来源.md) | 图片作者、原始作品及许可 |

分阶段文档保留各自版本的测试数量和当时限制，不作为当前总览；当前行为、版本和验证边界以本 README 为准。截图为开发／测试环境的证据，不要求提交包自带截图中的账户和历史数据。
