# 《长安的荔枝》原创分镜提示词

## 生成方式

- 工具：Codex 内置 imagegen。
- 用途分类：`historical-scene` 与 `illustration-story`。
- 输出：15 张 2×2 四格分镜，每格作为一个可独立裁切的竖屏镜头。
- 角色参考：第一组确定李善德形象；后续各组只把第一组作为人物与风格参考，均生成全新场景。

## 所有分镜共用约束

```text
Asset type: 2x2 storyboard sheet for a vertical Chinese book-commentary video.
Style: refined contemporary Chinese editorial illustration, gongbi-inspired linework, flat gouache, subtle paper grain.
Palette: ink blue, jade green, cinnabar red, old gold.
Composition: exact 2x2 grid, four equal panels, thin dark gutters, portrait sheet around 9:16; every panel is a complete crop-safe composition.
Character: Li Shande is a middle-aged Chinese clerk with a tired but intelligent face, short mustache and beard, dark teal Tang robe and black futou; preserve identity across historical scenes.
Avoid: text, letters, numbers, captions, watermark, logos, book covers, film stills, celebrity or actor likeness, extra panels, merged panels.
```

## 15 组场景提示

1. `01-hook.png`：卷宗高墙下的低阶小吏；突然接到危险文书；荔枝、算盘与漫长路线；把荒唐命令拆成系统工程。
2. `02-context.png`：不同年代史料；文学想象与档案记录的边界；荔枝产地与路线争议；上层命令向基层转化为流程和成本。
3. `03-assignment.png`：一家人刚搬进小宅；房贷和家庭开支；危险任务在衙门层层下压；李善德独自签字担责。
4. `04-measure.png`：荔枝新鲜到腐坏的时间序列；比较不同品种；测量马程、水路和关卡；七类变量的实体化组合。
5. `05-experiment.png`：四队走四路；测试双层瓮、盐洗和包装；在不同距离失败；把失败数据组合成下一轮方案。
6. `06-breakthrough.png`：果农连枝砍下带来启发；枝条植入瓮中；盐洗、竹箨、隔水和冰镇；远程开瓮验证鲜果。
7. `07-system.png`：南方到长安的发光接力网络；驿站骑手换马交接；船、马和冰块在码头协同；格眼簿核对责任。
8. `08-communication.png`：压缩复杂分析；白墙前汇报路线与试验；决策者判断成本和死线；多部门接收统一任务。
9. `09-power.png`：权力在方案可行后接管；功劳向上转移；胡商苏谅被关在利益分配门外；庆功声中李善德独行。
10. `10-cost.png`：荔枝成本与骆驼、钱堆对比；空国库旁命令继续下压；受伤骑手和过劳马匹；被砍毁的果园与农户。
11. `11-boundary.png`：荔枝进宫而李善德厌恶；账册浮现沿途代价；拿账册质问权相；失去前途却重新站直。
12. `12-lessons-a.png`：现代经理收到不合理目标；定义期限、质量、预算、资源和责任；小成本原型验证；公开失败数据。
13. `13-lessons-b.png`：现代团队的清晰接力；系统协作替代英雄透支；健康、供应商和信任等隐藏成本；负责人权衡结果与人的后果。
14. `14-ending.png`：一家人离开长安；回岭南补种果树；成为普通果农；远处长安陷入乱世而家人在果园相守。
15. `15-close.png`：李善德照铜镜；唐代小吏与现代职场人平行；现代人追问项目代价；荔枝园日出与重新生长。

所有图片均保存在 `public/assets/storyboards`，工程通过 `content/visual-plan.json` 选择具体格子和镜头顺序。
