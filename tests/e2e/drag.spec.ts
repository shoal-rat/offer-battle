import {
  test,
  expect,
  type Page,
  type APIRequestContext,
  type Locator,
} from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function lesson(
  page: Page,
  request: APIRequestContext,
  lessonId = "L01",
) {
  const session = await (
    await request.post("/api/session", { data: { nickname: "拖拽体验测试" } })
  ).json();
  const response = await request.post("/api/rooms", {
    headers: { Authorization: `Bearer ${session.token}` },
    data: { mode: "bot", training: true, lessonId },
  });
  expect(response.ok()).toBe(true);
  const saved = await response.json();
  await page.addInitScript(
    ({ token, id }) => {
      localStorage.setItem("offer-session", token);
      localStorage.setItem("offer-active-room", id);
      localStorage.setItem("offer-sound", "0");
      localStorage.setItem("offer-reduced", "1");
    },
    { token: session.token, id: saved.room.id },
  );
  let commands = 0;
  page.on("request", (r) => {
    if (
      r.method() === "POST" &&
      r.url().endsWith(`/api/rooms/${saved.room.id}/command`)
    )
      commands++;
  });
  await page.goto("/");
  await expect(page.locator(".battle-page")).toBeVisible();
  await expect(page.locator('[data-tutorial="endTurn"]')).not.toContainText(
    "结算中",
  );
  return {
    ...saved,
    commands: () => commands,
    state: async () =>
      (
        await request.get(`/api/rooms/${saved.room.id}`, {
          headers: { Authorization: `Bearer ${session.token}` },
        })
      ).json(),
  };
}
async function center(locator: Locator) {
  const r = await locator.boundingBox();
  if (!r) throw Error("Drag target is not visible");
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}
async function moveCard(
  page: Page,
  source: Locator,
  target: Locator | { x: number; y: number },
) {
  const from = await center(source),
    to = "x" in target ? target : await center(target);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
}
function board(page: Page) {
  return page.locator(".friendly-row .empty-slot").last();
}

test("Offer mouse drag preserves the compact card, highlights the board and submits once", async ({
  page,
  request,
}) => {
  const saved = await lesson(page, request),
    source = page.locator('[data-offer-id="E02"]');
  await expect(source).toHaveAttribute("data-card-drag-enabled", "true");
  const original = await source
    .locator(".card-art")
    .evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      font: getComputedStyle(el.parentElement!.querySelector(".card-ribbon")!)
        .fontSize,
    }));
  await moveCard(page, source, board(page));
  await expect(page.locator(".card-drag-overlay")).toBeVisible();
  await expect(page.locator(".card-drag-hint")).toHaveText("松开出牌");
  await expect(page.locator(".friendly-row")).toHaveClass(/card-drag-hover/);
  expect(
    await page
      .locator(".card-drag-ghost .card-art")
      .evaluate((el) => getComputedStyle(el).height),
  ).toBe(`${original.height}px`);
  expect(
    await page
      .locator(".card-drag-ghost .card-ribbon")
      .evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe(original.font);
  expect(await page.locator('.card-drag-ghost').evaluate(root=>[...root.querySelectorAll('[mask]')].every(el=>{const id=el.getAttribute('mask')?.match(/url\(#([^)]*)\)/)?.[1];return !id||root.querySelectorAll(`[id="${CSS.escape(id)}"]`).length===1&&document.querySelectorAll(`[id="${CSS.escape(id)}"]`).length===1}))).toBe(true);
  await mkdir("evidence/screenshots/drag", { recursive: true });
  await page.screenshot({ path: "evidence/screenshots/drag/offer-ghost.png" });
  await page.mouse.up();
  await expect
    .poll(async () => (await saved.state()).room.tutorial.stepIndex)
    .toBe(1);
  expect(saved.commands()).toBe(1);
  await expect(page.locator(".card-drag-overlay")).toHaveCount(0);
  await expect(page.locator(".card-drag-target")).toHaveCount(0);
});

test("off-board, Escape, tutorial-locked cards and read mode never submit a drag", async ({
  page,
  request,
}) => {
  const saved = await lesson(page, request),
    source = page.locator('[data-offer-id="E02"]');
  await moveCard(page, source, { x: 10, y: 10 });
  await expect(page.locator(".card-drag-hint")).toContainText("移到外面取消");
  await page.mouse.up();
  await moveCard(page, source, board(page));
  await page.keyboard.press("Escape");
  await expect(page.locator(".card-drag-overlay")).toHaveCount(0);
  await page.mouse.up();
  await expect(page.locator('[data-offer-id="E01"]')).toHaveAttribute(
    "data-card-drag-enabled",
    "false",
  );
  await expect(page.locator("[data-hand-id]").first()).toHaveAttribute(
    "data-card-drag-enabled",
    "false",
  );
  await moveCard(page, page.locator('[data-offer-id="E01"]'), board(page));
  await expect(page.locator(".card-drag-overlay")).toHaveCount(0);
  await page.mouse.up();
  await page.getByRole("button", { name: "放大读牌", exact: true }).click();
  await expect(source).toHaveAttribute("data-card-drag-enabled", "false");
  await moveCard(page, source, board(page));
  await expect(page.locator(".card-drag-overlay")).toHaveCount(0);
  await page.mouse.up();
  expect(saved.commands()).toBe(0);
  expect((await saved.state()).room.tutorial.stepIndex).toBe(0);
});

test("targeted hand card can stage on the board, or drop directly on its legal target", async ({
  page,
  request,
}) => {
  const saved = await lesson(page, request, "L02"),
    command = saved.room.tutorial.allowedCommands[0];
  const source = page.locator(`[data-hand-id="${command.cardId}"]`),
    target = page.locator(`[data-battle-id="${command.targetId}"]`);
  const original = await source
    .locator(".common-art")
    .evaluate((el) => getComputedStyle(el).height);
  await moveCard(page, source, board(page));
  const dropPoint=await center(board(page));
  await expect.poll(async()=>Math.round((await center(page.locator('.card-drag-ghost'))).x)).toBe(Math.round(dropPoint.x));
  await expect.poll(async()=>Math.round((await center(page.locator('.card-drag-ghost'))).y)).toBe(Math.round(dropPoint.y));
  await expect(page.locator(".card-drag-hint")).toHaveText("松开选择目标");
  await expect(target).toHaveClass(/card-drag-target/);
  expect(
    await page
      .locator(".card-drag-ghost .common-art")
      .evaluate((el) => getComputedStyle(el).height),
  ).toBe(original);
  expect(await page.locator('.card-drag-ghost').evaluate(root=>[...root.querySelectorAll('[mask]')].every(el=>{const id=el.getAttribute('mask')?.match(/url\(#([^)]*)\)/)?.[1];return !id||root.querySelectorAll(`[id="${CSS.escape(id)}"]`).length===1&&document.querySelectorAll(`[id="${CSS.escape(id)}"]`).length===1}))).toBe(true);
  await mkdir("evidence/screenshots/drag", { recursive: true });
  await page.screenshot({ path: "evidence/screenshots/drag/hand-ghost.png" });
  await page.mouse.up();
  await expect(page.getByRole("button", {name:"取消瞄准",exact:true})).toBeVisible();
  expect(saved.commands()).toBe(0);
  await page.getByRole("button", { name: "取消瞄准", exact: true }).click();
  await moveCard(page, source, target);
  await expect(page.locator(".card-drag-hint")).toHaveText("松开出牌");
  await expect(target).toHaveClass(/card-drag-hover/);
  await page.mouse.up();
  await expect
    .poll(async () => (await saved.state()).room.tutorial.stepIndex)
    .toBe(1);
  expect(saved.commands()).toBe(1);
});

test("movement below the drag threshold plays the card once as a single click", async ({page,request}) => {
  const saved=await lesson(page,request),from=await center(page.locator('[data-offer-id="E02"]'));
  await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(from.x+3,from.y+2);
  await expect(page.locator('.card-drag-overlay')).toHaveCount(0);await page.mouse.up();
  await expect.poll(async()=>(await saved.state()).room.tutorial.stepIndex).toBe(1);
  expect(saved.commands()).toBe(1);await expect(page.locator('.action-confirm-tray')).toHaveCount(0);
});

test("a pending command disables a second drag until its accepted snapshot arrives", async ({page,request}) => {
  const saved=await lesson(page,request),source=page.locator('[data-offer-id="E02"]');
  let release!:()=>void,requested!:()=>void;
  const pending=new Promise<void>(resolve=>{release=resolve}),received=new Promise<void>(resolve=>{requested=resolve});
  await page.route(`**/api/rooms/${saved.room.id}/command`,async route=>{requested();await pending;await route.continue()});
  try{
    await moveCard(page,source,board(page));await page.mouse.up();await received;
    await expect(source).toHaveAttribute('data-card-drag-enabled','false');
    await moveCard(page,source,board(page));await expect(page.locator('.card-drag-overlay')).toHaveCount(0);await page.mouse.up();
    expect(saved.commands()).toBe(1);release();await expect.poll(async()=>(await saved.state()).room.tutorial.stepIndex).toBe(1);
  }finally{release()}
});

test("touch pointer capture drags a legal Offer without a duplicate compatibility click", async ({
  browser,
  request,
}, testInfo) => {
  const context = await browser.newContext({
      baseURL: String(testInfo.project.use.baseURL),
      viewport: { width: 1440, height: 900 },
      hasTouch: true,
      reducedMotion: "reduce",
    }),
    page = await context.newPage();
  try {
    const saved = await lesson(page, request),
      source = await center(page.locator('[data-offer-id="E02"]')),
      to = await center(board(page)),
      cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ ...source, id: 1 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{...to,id:1}],
    });
    await expect(page.locator('.card-drag-overlay')).toBeVisible();
    await cdp.send("Input.dispatchTouchEvent", {type:'touchCancel',touchPoints:[]});
    await expect(page.locator('.card-drag-overlay')).toHaveCount(0);expect(saved.commands()).toBe(0);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ ...source, id: 1 }],
    });
    for (let step = 1; step <= 8; step++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: source.x + ((to.x - source.x) * step) / 8,
            y: source.y + ((to.y - source.y) * step) / 8,
            id: 1,
          },
        ],
      });
    await expect(page.locator(".card-drag-hint")).toHaveText("松开出牌");
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(async () => (await saved.state()).room.tutorial.stepIndex)
      .toBe(1);
    expect(saved.commands()).toBe(1);
    await expect(page.locator(".card-drag-overlay")).toHaveCount(0);
  } finally {
    await context.close();
  }
});
