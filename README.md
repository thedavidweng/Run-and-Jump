# Neon Beat Runner · 霓虹节拍跑者

节拍驱动的浏览器无限奔跑横版游戏(Muse Dash 风格 × chrome://dino)。角色自动向前狂奔,操作只有两个意图:

- **跳**:按一下跳跃,**按住**跳更高,**空中再按**二段跳(前空翻);空中按 ↓ 急坠抢落点
- **滑**:按住 ↓/S 滑铲,贴地穿过**激光门**(保持滑行穿门有额外连击加分)
- 跳过 **尖刺** 与 **高墙**、滑过 **激光门**(撞上即失败),空中撞碎 **节拍妖精** 攒连击,顺路收集 **音符**
- 连击提升倍率(×1→×4),×4 进入 FEVER:泛光增强、音乐加入琶音层
- 音乐与刷怪共用一个节拍时钟:障碍恰好踩在节拍点上到达,BPM 随距离 120→174

**操作**:空格 / ↑ / W / Enter / 鼠标点击 / 触屏点击 = 跳 · ↓ / S / 按住触屏下缘 = 滑铲 · `P` 暂停 · `M` 静音 · 死亡后同键重开

**i18n**:自动识别浏览器语言(中文/English),主菜单可切换并持久化,界面全量单语。

## 技术栈(2026 前沿)

| 层 | 选型 |
| --- | --- |
| 渲染 | three.js 0.185 **WebGPURenderer**(不支持 WebGPU 时自动回退 WebGL2) |
| 着色 | **TSL**(Three Shading Language):天空渐变、日轮、RenderPipeline + Bloom + 暗角后处理 |
| 语言 | **TypeScript 6.0**(严格模式;曾尝试 TS 7 原生编译器,其对 @types/three 的 TSL 递归类型存在病理性检查耗时 >20 分钟未收敛,故锁定 6.0.3——全项目检查约 13 秒) |
| 构建 | **Vite 8** |
| 音频 | Web Audio 全程序化生成:鼓组/贝斯/和弦/琶音 + 全套 SFX,零音频资源 |
| 物理 | 自研街机碰撞(AABB/圆),按体感手调,不引入物理引擎 |
| 验证 | Playwright 1.62(桌面 Chromium WebGPU + 移动 WebKit) |

## 脚本

```bash
npm install
npm run dev            # http://127.0.0.1:5188
npm run build          # tsc + vite build
npm run test           # Playwright:开局→跳跃→滑铲→死亡→重开 + i18n 检测/切换/持久化
npm run inspect:canvas # 截图 + 画布像素/诊断检查(需 dev server 在跑)
node scripts/playtest.mjs --seconds 40   # 自动游玩机器人(读诊断精准跳跃/滑铲)
```

`?debug` URL 参数打开 lil-gui 调参面板(重力、跳跃速度、Bloom 等)。

## 架构

```
src/
  main.ts            引导(异步初始化 WebGPU + i18n 挂载)
  core/              Renderer(WebGPU+TSL 后处理) · Loop · Input(跳/滑双意图) · i18n · diagnostics
  game/              Game(编排/状态机) · BeatClock(节拍时钟) · GameState · difficulty · patterns(节拍谱面)
  entities/          Player(可变跳高/缓冲/土狼时间/二段跳/滑铲/急坠) · scrolling(尖刺/墙/激光门/飞怪/音符)
  systems/           Spawner(对象池+谱面调度) · CollisionSystem · Environment(视差/节拍线)
                     CameraRig(纵横比自适应+trauma 抖动/FOV) · Vfx(InstancedMesh 粒子池) · AudioSystem · Hud
  assets/            palette · factories(全程序化建模,零外部资源)
```

更新顺序:输入 → 相位转换 → 节拍钟 → 刷怪 → 玩家物理 → 碰撞 → 计分/反馈 → 粒子 → 相机 → 音乐调度 → HUD → 诊断 → 渲染。

关键机制:所有滚动实体每帧由 `x = timeUntil(arrivalBeat) × speed` 定位,因此无论速度/BPM 如何爬升,到达玩家的时刻都精确落在节拍上——谱面即音乐。

测试诊断通过 `window.__THREE_GAME_DIAGNOSTICS__` 暴露(相位、分数、连击、滑铲状态、最近实体、渲染后端等)。

---

# Neon Beat Runner (English)

A beat-driven endless runner for the browser (Muse Dash vibes × chrome://dino). Your runner sprints on their own; you only have two intents:

- **Jump**: tap to hop, **hold** for a full jump, **tap again in the air** to double-jump; stab ↓ mid-air to fast-fall
- **Slide**: hold ↓/S (or the bottom edge on touch) to slide under **laser gates** — staying low through a gate pays a style bonus
- Clear **spikes** and **walls**, smash **beat imps** mid-air, collect **notes**; combo raises your multiplier to ×4 FEVER
- Music and spawning share one beat clock — every obstacle arrives exactly on the beat, BPM ramps 120→174

**Stack**: three.js 0.185 WebGPURenderer (auto WebGL2 fallback) · TSL post-processing (bloom + vignette) · Vite 8 · TypeScript 6 strict · fully procedural Web Audio (zero assets) · Playwright-verified on desktop Chromium (WebGPU) and mobile WebKit.

`npm install && npm run dev` → http://127.0.0.1:5188 · UI language auto-detects (中文/English) and can be switched from the main menu.
