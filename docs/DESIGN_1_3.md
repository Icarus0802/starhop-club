# 东方轻幻想棋室 · 1.3 设计记录

## 界面方向

用户选择东方轻幻想。采用曜石、青玉与暖金，保留星跃品牌；棋盘、当前行棋、上一手路径组成主要操作区域。角色作为棋手视觉呈现，难度与思考状态显示真实当前配置。

参考 [Linear 2026界面调整](https://linear.app/now/behind-the-latest-design-refresh)的可扫读、密度与层级处理，以及 [Apple材质规范](https://developer.apple.com/design/human-interface-guidelines/materials)的内容与导航分层。设计原则由本项目重新实现，没有复制第三方界面、图标、人物或商业素材。

深浅主题与专注模式作为可逆外观偏好单独保存。全部棋牌按钮和棋谱元素保留原ID，避免展示改动干扰Worker请求与回放。折叠的详细分析依然随棋局更新，展开后可直接看到最新状态。

宽屏使用画像、棋盘与分析三列；笔记本短屏保留较窄画像列，为棋盘节省竖向空间。手机立绘改为短横幅，640px高的小屏收起画像，让44px主操作完整留在底导航上方；专注模式进一步扩大星盘。以上布局经过六种实际浏览器尺寸检查。浅色主题重新声明语义颜色，确保走势、路径与文字一起切换。

## 原创棋手主视觉素材

- 文件：`assets/starhop-strategist.webp`，900 × 1350 像素，283,688 字节（约 277 KiB），保留透明 alpha。
- 文件 SHA256：`f60daa227947c769d4ed0428503ffc3fe020eeaf18239c58415909ea6e97496f`。
- 来源：本会话内置 `image_gen.imagegen`，新生成单一原创角色；未使用第三方人物素材、参考图、已知 IP 或外部密钥。
- 生成参数：`transparent_background: true`；不传参考图。原始输出为 1024 × 1536 RGBA PNG，保留在工具默认生成目录。
- 后处理仅为 Pillow 等比例缩放和 PNG→WebP 格式编码，质量 90、alpha_quality 100；没有抠图、改脸、补画、改服饰或其他内容编辑。
- 已检查成年女性面部、衣着、站姿、手持一颗翡翠棋子、无文字水印；四角 alpha 为 0，图像确有透明区域。另在深绿底色上按浏览器 alpha 合成规则渲染预览，确认头发与衣角没有明显彩色边缘。检查预览只在忽略目录，不改变最终素材。适合置于深色青玉棋室背景。

### 最终生成提示词

```text
Use case: stylized-concept.
Asset type: one premium original character illustration for the main visual of a Chinese checkers game website, a single isolated character cutout on a genuinely transparent background, not a UI screenshot.
Subject: an original clearly adult Eastern woman strategist in her early thirties, mature and poised, elegant intelligent face, calm focused eyes, softly composed expression, beautiful without exaggerated childlike proportions. Long black hair partly arranged in a refined updo, a small simple jade hair ornament and restrained warm gold detailing.
Clothing: modest graceful layered white and deep forest green silk robes inspired by Eastern light fantasy, an elegant high collar and long sleeves, fine silk folds, subtle pale jade edging, a restrained warm gold belt and small simple six-pointed star jade accessory. No armor, weapons, exposed chest, revealing cuts, or oversized ornaments.
Pose and composition: full-length relaxed standing pose, body slightly turned three quarters toward the viewer, face clear and angled forward. One hand naturally and delicately holds exactly one small round translucent emerald Chinese-checkers marble at chest height, the other hand rests lightly near the waist. Anatomically natural hands. Whole figure including hair and flowing lower robe visible with comfortable margins and a little breathing room all around; graceful vertical composition suitable for a website hero.
Style and lighting: highly polished mature anime-inspired game concept painting, fine clean brushwork, sophisticated readable silhouette, exquisite but restrained fabric detail, soft warm gold key light and faint jade rim light so the character reads beautifully against a dark green game room. Rich forest green, ivory, pale jade and muted warm gold palette. Crisp readable face, elegant painterly materials, premium contemporary game illustration quality.
Background: actual transparent alpha everywhere outside the character and very subtle accessory glow; no checkerboard painted into the artwork, no floor, no scenery, no room, no card frame.
Constraints: one character only; entirely original design, do not imitate any existing game, anime character, artist or known IP. No text, letters, logo, watermark, UI, symbols resembling writing. No youthful or childlike appearance.
```
