// MamaVege 2026 H1 业绩报告 PPT
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const {
  FaLeaf, FaTrophy, FaPercentage, FaBalanceScale, FaMoneyBillWave,
  FaBullseye, FaBoxes, FaCheckCircle, FaCalculator, FaUsers,
  FaStore, FaChartLine, FaHandHoldingUsd, FaWarehouse, FaFlagCheckered
} = require("react-icons/fa");

// ---------- palette ----------
const DARK  = "1C3A22"; // deep forest bg
const GREEN = "2C6E31"; // primary green
const MOSS  = "97BC62"; // moss accent
const TINT  = "F1F7EC"; // light green tint card
const RED   = "C2453A"; // loss red
const REDT  = "FBEFEE"; // red tint
const GOLD  = "E0A93E"; // gold accent
const INK   = "26312A"; // body text
const MUTED = "6B7A6E"; // muted text
const WHITE = "FFFFFF";

const FONT = "Microsoft YaHei";

const shadow = () => ({ type: "outer", color: "000000", blur: 7, offset: 2, angle: 45, opacity: 0.13 });

async function iconPng(Icon, colorHex, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(
    React.createElement(Icon, { color: "#" + colorHex, size: String(size) })
  );
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}

(async () => {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9"; // 10 x 5.625
  pres.author = "MamaVege CEO Office";
  pres.title = "MamaVege 2026 上半年业绩报告";

  // pre-render icons
  const ic = {};
  const defs = {
    leafMoss:   [FaLeaf, MOSS],
    trophy:     [FaTrophy, GREEN],
    percent:    [FaPercentage, GREEN],
    balance:    [FaBalanceScale, GOLD],
    moneyRed:   [FaMoneyBillWave, RED],
    bullseyeRed:[FaBullseye, RED],
    boxesRed:   [FaBoxes, RED],
    moneyW:     [FaMoneyBillWave, WHITE],
    storeW:     [FaStore, WHITE],
    warehouseW: [FaWarehouse, WHITE],
    calc:       [FaCalculator, GREEN],
    check:      [FaCheckCircle, MOSS],
    checkGreen: [FaCheckCircle, GREEN],
    users:      [FaUsers, GREEN],
    store:      [FaStore, GREEN],
    bullseye:   [FaBullseye, GREEN],
    warehouse:  [FaWarehouse, GREEN],
    hand:       [FaHandHoldingUsd, GREEN],
    chart:      [FaChartLine, GREEN],
    flag:       [FaFlagCheckered, MOSS],
    leafGreen:  [FaLeaf, GREEN],
  };
  for (const [k, [I, c]] of Object.entries(defs)) ic[k] = await iconPng(I, c);

  const title = (s, t, color = INK) =>
    s.addText(t, { x: 0.5, y: 0.32, w: 9.0, h: 0.7, fontSize: 27, bold: true, color, fontFace: FONT, margin: 0 });

  // ============ S1 封面 ============
  {
    const s = pres.addSlide();
    s.background = { color: DARK };
    s.addShape(pres.shapes.OVAL, { x: 4.55, y: 0.85, w: 0.9, h: 0.9, fill: { color: "2A5232" } });
    s.addImage({ data: ic.leafMoss, x: 4.775, y: 1.075, w: 0.45, h: 0.45 });
    s.addText("妈子素 MamaVege", { x: 0.5, y: 1.95, w: 9, h: 0.5, align: "center", fontSize: 20, color: MOSS, fontFace: FONT, charSpacing: 2 });
    s.addText("2026 上半年业绩报告", { x: 0.5, y: 2.45, w: 9, h: 0.9, align: "center", fontSize: 40, bold: true, color: WHITE, fontFace: FONT });
    s.addText("诚实面对数字 · 把 5 月变成每一个月", { x: 0.5, y: 3.45, w: 9, h: 0.5, align: "center", fontSize: 17, color: "C9DCC0", fontFace: FONT });
    s.addText("2026 年 7 月 · 全员大会", { x: 0.5, y: 4.85, w: 9, h: 0.4, align: "center", fontSize: 12, color: "7E9B82", fontFace: FONT });
  }

  // ============ S2 好消息 ============
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    title(s, "先说最重要的：这个模式，已经跑通了");
    const cards = [
      { icon: ic.trophy, big: "RM +128,749", bigColor: GREEN, label: "5 月净利润", note: "上半年第一个盈利月" },
      { icon: ic.percent, big: "51.9%", bigColor: GREEN, label: "5 月毛利率", note: "整体 39.9%，5 月证明能做到更高" },
      { icon: ic.balance, big: "RM -142", bigColor: GOLD, label: "4 月净利润", note: "几乎打平 —— 转折从 4 月开始" },
    ];
    cards.forEach((c, i) => {
      const x = 0.5 + i * 3.1;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.25, w: 2.9, h: 2.95, rectRadius: 0.09, fill: { color: TINT }, shadow: shadow() });
      s.addShape(pres.shapes.OVAL, { x: x + 0.25, y: 1.55, w: 0.62, h: 0.62, fill: { color: WHITE } });
      s.addImage({ data: c.icon, x: x + 0.4, y: 1.7, w: 0.32, h: 0.32 });
      s.addText(c.label, { x: x + 0.25, y: 2.35, w: 2.4, h: 0.35, fontSize: 13, color: MUTED, fontFace: FONT, margin: 0 });
      s.addText(c.big, { x: x + 0.2, y: 2.68, w: 2.65, h: 0.65, fontSize: 24, bold: true, color: c.bigColor, fontFace: FONT, margin: 0 });
      s.addText(c.note, { x: x + 0.25, y: 3.38, w: 2.45, h: 0.7, fontSize: 11.5, color: INK, fontFace: FONT, margin: 0 });
    });
    s.addText([
      { text: "5 月不是运气。", options: { bold: true, color: GREEN } },
      { text: "是销量、毛利、费用三件事同时做对的结果 —— 这三件事，我们都会重复。", options: { color: INK } },
    ], { x: 0.5, y: 4.5, w: 9, h: 0.6, fontSize: 15, fontFace: FONT, margin: 0 });
  }

  // ============ S3 全貌（坦白亏损 + 图表）============
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    title(s, "也要坦白：上半年整体，还是亏的");
    // left stats
    s.addText("H1 总销售额", { x: 0.5, y: 1.35, w: 3.1, h: 0.35, fontSize: 13, color: MUTED, fontFace: FONT, margin: 0 });
    s.addText("RM 2,808,614", { x: 0.5, y: 1.68, w: 3.3, h: 0.6, fontSize: 26, bold: true, color: INK, fontFace: FONT, margin: 0 });
    s.addText("H1 净亏损", { x: 0.5, y: 2.5, w: 3.1, h: 0.35, fontSize: 13, color: MUTED, fontFace: FONT, margin: 0 });
    s.addText("RM -450,884", { x: 0.5, y: 2.83, w: 3.3, h: 0.65, fontSize: 30, bold: true, color: RED, fontFace: FONT, margin: 0 });
    s.addText("平均每卖 RM 100，就亏 RM 16。\n问题不在卖不动，在怎么卖、花多少。", { x: 0.5, y: 3.65, w: 3.2, h: 0.95, fontSize: 12.5, color: INK, fontFace: FONT, margin: 0 });
    // right chart: monthly net profit
    s.addText("各月净利润（RM）", { x: 4.2, y: 1.2, w: 5.3, h: 0.35, fontSize: 13, bold: true, color: INK, fontFace: FONT, margin: 0 });
    s.addChart(pres.charts.BAR, [{
      name: "净利润",
      labels: ["1月", "2月", "3月", "4月", "5月", "6月"],
      values: [-105183, -263583, -54134, -142, 128749, -156591],
    }], {
      x: 4.2, y: 1.55, w: 5.3, h: 3.5, barDir: "col",
      chartColors: [RED, RED, RED, GOLD, GREEN, RED],
      chartArea: { fill: { color: "FFFFFF" } },
      catAxisLabelColor: MUTED, valAxisLabelColor: MUTED,
      catAxisLabelFontFace: FONT, valAxisLabelFontFace: FONT, dataLabelFontFace: FONT,
      valGridLine: { color: "E4EAE2", size: 0.5 }, catGridLine: { style: "none" },
      showValue: true, dataLabelPosition: "outEnd", dataLabelColor: "3A463C", dataLabelFontSize: 9,
      showLegend: false, valAxisHidden: false,
    });
    s.addText("离盈利最近的两个月：4 月与 5 月 —— 这就是方向。", { x: 4.2, y: 5.05, w: 5.3, h: 0.4, fontSize: 12, italic: true, color: GREEN, fontFace: FONT, margin: 0 });
  }

  // ============ S4 三个原因 ============
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    title(s, "RM 450,884 亏在哪里？三个原因");
    const rows = [
      { icon: ic.moneyRed, h: "营业费用过高", t: "月均费用约 RM 261,000，月均毛利只有约 RM 187,000 —— 毛利养不起费用，先天就亏。" },
      { icon: ic.bullseyeRed, h: "营销花费没对准回报", t: "投放分散、凭感觉加码，花出去的钱没有算清楚带回多少销售 —— 钱花了，销量没跟上。" },
      { icon: ic.boxesRed, h: "库存压住太多现金", t: "约 RM 1,065,000 的货躺在仓库，132 天才转一圈 —— 现金被冻结，公司越转越紧。" },
    ];
    rows.forEach((r, i) => {
      const y = 1.3 + i * 1.28;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.5, y, w: 9.0, h: 1.08, rectRadius: 0.08, fill: { color: REDT }, shadow: shadow() });
      s.addText(String(i + 1), { x: 0.75, y: y + 0.24, w: 0.6, h: 0.6, fontSize: 30, bold: true, color: RED, fontFace: FONT, align: "center", margin: 0 });
      s.addImage({ data: r.icon, x: 1.55, y: y + 0.36, w: 0.36, h: 0.36 });
      s.addText(r.h, { x: 2.15, y: y + 0.12, w: 7.1, h: 0.4, fontSize: 15.5, bold: true, color: INK, fontFace: FONT, margin: 0 });
      s.addText(r.t, { x: 2.15, y: y + 0.5, w: 7.1, h: 0.52, fontSize: 11.5, color: "4A554C", fontFace: FONT, margin: 0 });
    });
    s.addText("三个原因，H2 一个一个拆掉。", { x: 0.5, y: 5.12, w: 9, h: 0.35, fontSize: 12.5, italic: true, color: MUTED, fontFace: FONT, margin: 0 });
  }

  // ============ S5 原因一：费用 ============
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    title(s, "原因一：费用是能降的 —— 5 月已经证明");
    // left card: monthly average
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.7, y: 1.4, w: 3.6, h: 2.5, rectRadius: 0.09, fill: { color: REDT }, shadow: shadow() });
    s.addText("上半年月均营业费用", { x: 1.0, y: 1.75, w: 3.0, h: 0.4, fontSize: 14, color: MUTED, fontFace: FONT, margin: 0 });
    s.addText("RM 261,000", { x: 1.0, y: 2.2, w: 3.1, h: 0.75, fontSize: 33, bold: true, color: RED, fontFace: FONT, margin: 0 });
    s.addText("超过月均毛利，做多少亏多少", { x: 1.0, y: 3.1, w: 3.1, h: 0.4, fontSize: 12, color: INK, fontFace: FONT, margin: 0 });
    // arrow
    s.addText("→", { x: 4.35, y: 2.25, w: 1.0, h: 0.8, fontSize: 40, bold: true, color: MUTED, align: "center", fontFace: FONT, margin: 0 });
    // right card: May
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 5.5, y: 1.4, w: 3.6, h: 2.5, rectRadius: 0.09, fill: { color: TINT }, shadow: shadow() });
    s.addText("5 月实际营业费用", { x: 5.8, y: 1.75, w: 3.0, h: 0.4, fontSize: 14, color: MUTED, fontFace: FONT, margin: 0 });
    s.addText("RM 204,000", { x: 5.8, y: 2.2, w: 3.1, h: 0.75, fontSize: 33, bold: true, color: GREEN, fontFace: FONT, margin: 0 });
    s.addText("同样的团队、同样的生意，照样运转", { x: 5.8, y: 3.1, w: 3.1, h: 0.4, fontSize: 12, color: INK, fontFace: FONT, margin: 0 });
    s.addText([
      { text: "费用最低的 5 月，恰好是利润最高的月份 —— 这不是巧合。", options: { bold: true, color: INK, breakLine: true } },
      { text: "每月省下约 RM 57,000，一年就是接近 RM 700,000 的利润空间。", options: { color: "4A554C" } },
    ], { x: 0.7, y: 4.25, w: 8.6, h: 0.9, fontSize: 14, fontFace: FONT, margin: 0 });
  }

  // ============ S6 原因二：营销 ============
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    title(s, "原因二：营销的钱，要花在看得见回报的地方");
    s.addText("上半年的问题：投放分散、凭感觉加码，没有用回报来决定花多少。", { x: 0.5, y: 1.15, w: 9, h: 0.45, fontSize: 14.5, color: INK, fontFace: FONT, margin: 0 });
    const steps = [
      { n: "1", h: "小额测试", t: "每个渠道、每档活动，先用小预算试跑" },
      { n: "2", h: "看回报数据", t: "算清楚：这笔钱带回多少销售" },
      { n: "3", h: "有效才加码", t: "回报达标就放大，不达标立刻停掉" },
    ];
    steps.forEach((st, i) => {
      const x = 0.6 + i * 3.15;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.85, w: 2.75, h: 2.15, rectRadius: 0.09, fill: { color: TINT }, shadow: shadow() });
      s.addShape(pres.shapes.OVAL, { x: x + 0.25, y: 2.1, w: 0.55, h: 0.55, fill: { color: GREEN } });
      s.addText(st.n, { x: x + 0.25, y: 2.1, w: 0.55, h: 0.55, fontSize: 20, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: FONT, margin: 0 });
      s.addText(st.h, { x: x + 0.25, y: 2.85, w: 2.3, h: 0.4, fontSize: 16, bold: true, color: INK, fontFace: FONT, margin: 0 });
      s.addText(st.t, { x: x + 0.25, y: 3.25, w: 2.3, h: 0.65, fontSize: 11.5, color: "4A554C", fontFace: FONT, margin: 0 });
      if (i < 2) s.addText("→", { x: x + 2.72, y: 2.6, w: 0.5, h: 0.6, fontSize: 24, bold: true, color: MUTED, align: "center", fontFace: FONT, margin: 0 });
    });
    s.addText([
      { text: "H2 只有一条营销纪律：", options: { bold: true, color: GREEN } },
      { text: "每一笔投放，都必须回答 “带回了多少销售”。回答不了，就不花。", options: { color: INK } },
    ], { x: 0.6, y: 4.4, w: 8.8, h: 0.6, fontSize: 15, fontFace: FONT, margin: 0 });
  }

  // ============ S7 原因三：库存 ============
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    title(s, "原因三：货压在仓库里，现金就不能动");
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.7, y: 1.35, w: 4.1, h: 1.5, rectRadius: 0.09, fill: { color: REDT }, shadow: shadow() });
    s.addImage({ data: ic.boxesRed, x: 1.0, y: 1.65, w: 0.45, h: 0.45 });
    s.addText("目前库存金额", { x: 1.65, y: 1.55, w: 2.9, h: 0.35, fontSize: 13, color: MUTED, fontFace: FONT, margin: 0 });
    s.addText("RM 1,065,000", { x: 1.65, y: 1.9, w: 3.0, h: 0.6, fontSize: 26, bold: true, color: RED, fontFace: FONT, margin: 0 });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 5.2, y: 1.35, w: 4.1, h: 1.5, rectRadius: 0.09, fill: { color: REDT }, shadow: shadow() });
    s.addImage({ data: ic.moneyRed, x: 5.5, y: 1.65, w: 0.45, h: 0.45 });
    s.addText("库存周转天数", { x: 6.15, y: 1.55, w: 2.9, h: 0.35, fontSize: 13, color: MUTED, fontFace: FONT, margin: 0 });
    s.addText("132 天", { x: 6.15, y: 1.9, w: 3.0, h: 0.6, fontSize: 26, bold: true, color: RED, fontFace: FONT, margin: 0 });
    // arrow flow 132 -> 90 -> release cash
    s.addText([
      { text: "132 天 ", options: { bold: true, color: RED, fontSize: 22 } },
      { text: " 压到 ", options: { color: MUTED, fontSize: 15 } },
      { text: "90 天", options: { bold: true, color: GREEN, fontSize: 22 } },
      { text: "  ＝  释放现金约 ", options: { color: MUTED, fontSize: 15 } },
      { text: "RM 360,000", options: { bold: true, color: GREEN, fontSize: 22 } },
    ], { x: 0.7, y: 3.2, w: 8.6, h: 0.6, align: "center", fontFace: FONT, margin: 0 });
    s.addText([
      { text: "库存不是资产，卖出去才是。", options: { bold: true, color: INK, breakLine: true } },
      { text: "H2 原则：先卖完现有的货，再谈进新货；滞销品该促销就促销、该止损就止损。", options: { color: "4A554C" } },
    ], { x: 0.7, y: 4.15, w: 8.6, h: 0.95, fontSize: 14, fontFace: FONT, margin: 0 });
  }

  // ============ S8 H2 三大目标 ============
  {
    const s = pres.addSlide();
    s.background = { color: DARK };
    s.addText("下半年，全公司只盯三个数字", { x: 0.5, y: 0.35, w: 9, h: 0.7, fontSize: 27, bold: true, color: WHITE, fontFace: FONT, margin: 0 });
    const goals = [
      { icon: ic.storeW, label: "月销售额", big: "≥ RM 550,000", proof: "5 月做到过 RM 641,493" },
      { icon: ic.moneyW, label: "月营业费用", big: "≤ RM 220,000", proof: "5 月做到过 RM 204,000" },
      { icon: ic.warehouseW, label: "库存天数", big: "≤ 90 天", proof: "释放现金约 RM 360,000" },
    ];
    goals.forEach((g, i) => {
      const x = 0.5 + i * 3.1;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.35, w: 2.9, h: 2.9, rectRadius: 0.09, fill: { color: "27492E" } });
      s.addImage({ data: g.icon, x: x + 0.28, y: 1.68, w: 0.42, h: 0.42 });
      s.addText(g.label, { x: x + 0.28, y: 2.3, w: 2.4, h: 0.4, fontSize: 14, color: "AFC9A6", fontFace: FONT, margin: 0 });
      s.addText(g.big, { x: x + 0.28, y: 2.7, w: 2.55, h: 0.6, fontSize: 24, bold: true, color: WHITE, fontFace: FONT, margin: 0 });
      s.addImage({ data: ic.check, x: x + 0.28, y: 3.5, w: 0.26, h: 0.26 });
      s.addText(g.proof, { x: x + 0.62, y: 3.46, w: 2.2, h: 0.6, fontSize: 11.5, color: MOSS, fontFace: FONT, margin: 0 });
    });
    s.addText("三个数字，5 月都摸到过 —— 我们不是在赌，是在重复已经做到的事。", { x: 0.5, y: 4.6, w: 9, h: 0.5, align: "center", fontSize: 14.5, color: "C9DCC0", fontFace: FONT, margin: 0 });
  }

  // ============ S9 算给你看 ============
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    title(s, "三个数字达标，会发生什么？");
    const chips = [
      { t1: "月销售", t2: "RM 550,000", c: INK },
      { op: "×" },
      { t1: "毛利率 · 5月水平", t2: "约 51%", c: INK },
      { op: "−" },
      { t1: "月费用", t2: "RM 220,000", c: INK },
      { op: "=" },
      { t1: "每月净赚", t2: "约 RM 63,000", c: GREEN },
    ];
    let x = 0.42;
    const widths = [1.45, 0.42, 1.85, 0.42, 1.45, 0.42, 1.72];
    chips.forEach((c, i) => {
      const w = widths[i];
      if (c.op) {
        s.addText(c.op, { x, y: 1.75, w, h: 0.9, fontSize: 24, bold: true, color: MUTED, align: "center", valign: "middle", fontFace: FONT, margin: 0 });
      } else {
        s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.55, w, h: 1.3, rectRadius: 0.08, fill: { color: c.c === GREEN ? TINT : "F5F6F4" }, shadow: shadow() });
        s.addText(c.t1, { x: x + 0.12, y: 1.72, w: w - 0.2, h: 0.35, fontSize: 11.5, color: MUTED, fontFace: FONT, margin: 0 });
        s.addText(c.t2, { x: x + 0.12, y: 2.08, w: w - 0.16, h: 0.6, fontSize: 14.5, bold: true, color: c.c, fontFace: FONT, margin: 0 });
      }
      x += w + 0.03;
    });
    s.addText([
      { text: "每月约 RM 63,000 × 6 个月 ≈ ", options: { color: INK } },
      { text: "H2 赚回约 RM 380,000", options: { bold: true, color: GREEN } },
    ], { x: 0.5, y: 3.15, w: 9, h: 0.5, align: "center", fontSize: 17, fontFace: FONT, margin: 0 });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 1.6, y: 3.8, w: 6.8, h: 1.05, rectRadius: 0.09, fill: { color: TINT }, shadow: shadow() });
    s.addText([
      { text: "上半年 -45 万  +  下半年 +38 万  ≈  ", options: { color: INK, fontSize: 16 } },
      { text: "全年基本打平", options: { bold: true, color: GREEN, fontSize: 19 } },
    ], { x: 1.6, y: 3.8, w: 6.8, h: 1.05, align: "center", valign: "middle", fontFace: FONT, margin: 0 });
    s.addText("不靠奇迹，不靠翻倍 —— 只要把 5 月重复六次。", { x: 0.5, y: 5.05, w: 9, h: 0.4, align: "center", fontSize: 13, italic: true, color: MUTED, fontFace: FONT, margin: 0 });
  }

  // ============ S10 部门责任 ============
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    title(s, "把 5 月变成每一个月：每个团队的任务");
    const rows = [
      { icon: ic.store, h: "销售团队", t: "每月 RM 550,000，主推高毛利产品，盯紧每一家门店与渠道" },
      { icon: ic.bullseye, h: "市场营销", t: "每笔投放先小额测试、算回报 —— 对不上回报的，立刻停" },
      { icon: ic.warehouse, h: "运营与采购", t: "库存天数压到 90 天：先卖完现有库存，再谈进货和新品" },
      { icon: ic.hand, h: "财务", t: "守住每月 RM 220,000 费用红线，三个数字每月向全员公开" },
      { icon: ic.users, h: "每一个人", t: "花每一块钱之前先问：这能帮我们多卖多少？" },
    ];
    rows.forEach((r, i) => {
      const y = 1.18 + i * 0.82;
      s.addShape(pres.shapes.OVAL, { x: 0.6, y: y + 0.07, w: 0.52, h: 0.52, fill: { color: TINT } });
      s.addImage({ data: r.icon, x: 0.73, y: y + 0.2, w: 0.26, h: 0.26 });
      s.addText(r.h, { x: 1.35, y, w: 1.75, h: 0.66, fontSize: 15, bold: true, color: INK, valign: "middle", fontFace: FONT, margin: 0 });
      s.addText(r.t, { x: 3.15, y, w: 6.3, h: 0.66, fontSize: 12.5, color: "4A554C", valign: "middle", fontFace: FONT, margin: 0 });
      if (i < rows.length - 1) s.addShape(pres.shapes.LINE, { x: 1.35, y: y + 0.74, w: 8.1, h: 0, line: { color: "E4EAE2", width: 0.75 } });
    });
  }

  // ============ S11 结尾 ============
  {
    const s = pres.addSlide();
    s.background = { color: DARK };
    s.addImage({ data: ic.flag, x: 4.7, y: 1.15, w: 0.6, h: 0.6 });
    s.addText("5 月已经证明：我们能赢", { x: 0.5, y: 2.0, w: 9, h: 0.85, align: "center", fontSize: 36, bold: true, color: WHITE, fontFace: FONT });
    s.addText("下半年的任务只有一个 —— 把那一个月，变成每一个月。", { x: 0.5, y: 2.95, w: 9, h: 0.5, align: "center", fontSize: 17, color: MOSS, fontFace: FONT });
    s.addText("谢谢大家 · 2026 H2，一起把钱赚回来", { x: 0.5, y: 4.4, w: 9, h: 0.45, align: "center", fontSize: 13, color: "7E9B82", fontFace: FONT });
  }

  await pres.writeFile({ fileName: "MamaVege_2026上半年业绩报告.pptx" });
  console.log("done");
})();
