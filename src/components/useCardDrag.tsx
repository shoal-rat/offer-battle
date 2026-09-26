import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type DragEvent as ReactDragEvent,
} from "react";
import { createPortal } from "react-dom";
import type { Command } from "../game/types";
import {
  dragActions,
  commandsForDrop,
  dropNeedsTarget,
  type CardDragSource,
  type CardDropLocation,
} from "./card-drag-model";
import "../styles/card-drag.css";
import {motionDirector,type MotionHandle} from "../motion/MotionDirector";
import {remapCloneIds} from '../motion/paperRig';
import {getMotionPreferences} from "../motion/useMotionPreferences";

interface Options {
  arenaRef: RefObject<HTMLElement | null>;
  selfId: string;
  legalActions: Command[];
  busy: boolean;
  /** Change on every accepted snapshot to cancel a drag based on the older board. */
  epoch: string | number;
  onDrop: (commands: Command[], label: string, needsTarget: boolean) => void;
  onStart?: () => void;
}
interface DragSession {
  source: CardDragSource;
  element: HTMLElement;
  pointerId: number;
  startX: number;
  startY: number;
  threshold: number;
  epoch: string | number;
  started: boolean;
  clone?: HTMLElement;
  width: number;
  height: number;
}
interface Ghost {
  clone: HTMLElement;
  x: number;
  y: number;
  width: number;
  height: number;
  valid: boolean;
  needsTarget: boolean;
  contextClass: string;
  sourceKind: CardDragSource["kind"];
  label: string;
}

function DragGhost({ ghost }: { ghost: Ghost }) {
  const content = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    content.current?.replaceChildren(ghost.clone);
    return () => {
      ghost.clone.remove();
    };
  }, [ghost.clone]);
  return createPortal(
    <div
      className={`card-drag-overlay ${ghost.contextClass} ${ghost.valid ? "valid" : ""}`}
      aria-hidden="true"
      data-card-drag-overlay="true"
    >
      <div
        className={`card-drag-ghost ${ghost.sourceKind === "offer" ? "offer-hand" : ""}`}
        style={{
          left: ghost.x,
          top: ghost.y,
          width: ghost.width,
          height: ghost.height,
        }}
        ref={content}
      />
      <div
        className="card-drag-hint"
        style={{ left: ghost.x, top: ghost.y + ghost.height / 2 + 20 }}
      >
        {ghost.valid
          ? ghost.needsTarget
            ? "松开选择目标"
            : "松开出牌"
          : "拖到发光区域 · 移到外面取消"}
      </div>
    </div>,
    document.body,
  );
}

/** Pointer dragging keeps taps as clicks and delegates every accepted drop to Battle. */
export function useCardDrag(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const session = useRef<DragSession | null>(null),
    highlighted = useRef(new Set<HTMLElement>()),
    hovered = useRef<HTMLElement | null>(null);
  const suppressClickUntil = useRef(0),
    mounted = useRef(false);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const motion=useRef<MotionHandle|null>(null),dragSerial=useRef(0),position=useRef({x:0,y:0});
  const motionScope=useId();
  function clearHighlights() {
    for (const el of highlighted.current)
      el.classList.remove("card-drag-target", "card-drag-board-target");
    highlighted.current.clear();
    hovered.current?.classList.remove("card-drag-hover");
    hovered.current = null;
  }
  function clear(show = true) {
    const previous = session.current;
    session.current = null;
    const oldMotion=motion.current;motion.current=null;oldMotion?.cancel();
    if (previous?.started) {
      suppressClickUntil.current = performance.now() + 500;
      previous.element.classList.remove("card-dragging-source");
    }
    try {
      if (previous?.element.hasPointerCapture(previous.pointerId))
        previous.element.releasePointerCapture(previous.pointerId);
    } catch {}
    clearHighlights();
    document.documentElement.classList.remove("card-drag-in-progress");
    if (show && mounted.current) setGhost(null);
  }
  function at(
    x: number,
    y: number,
  ): {
    location: CardDropLocation;
    target: HTMLElement | null;
    board: HTMLElement | null;
  } {
    const hit = document.elementFromPoint(x, y),
      arena = latest.current.arenaRef.current;
    if (!hit || !arena?.contains(hit))
      return { location: {}, target: null, board: null };
    const target = hit.closest<HTMLElement>("[data-battle-id]"),
      board = hit.closest<HTMLElement>("[data-card-drop-zone]");
    return {
      location: {
        targetId: target?.dataset.battleId,
        boardId: board?.dataset.cardDropZone,
      },
      target,
      board,
    };
  }
  function candidates(active: DragSession) {
    return latest.current.busy || latest.current.epoch !== active.epoch
      ? []
      : dragActions(active.source, latest.current.legalActions);
  }
  function highlight(actions: Command[]) {
    clearHighlights();
    const arena = latest.current.arenaRef.current;
    if (!arena) return;
    const targetIds = new Set(
      actions
        .filter((c) => !c.targetIds?.length)
        .map((c) => c.targetId)
        .filter(Boolean),
    );
    for (const el of arena.querySelectorAll<HTMLElement>("[data-battle-id]"))
      if (targetIds.has(el.dataset.battleId)) {
        el.classList.add("card-drag-target");
        highlighted.current.add(el);
      }
    if (actions.length)
      for (const el of arena.querySelectorAll<HTMLElement>(
        "[data-card-drop-zone]",
      ))
        if (el.dataset.cardDropZone === latest.current.selfId) {
          el.classList.add("card-drag-board-target");
          highlighted.current.add(el);
        }
  }
  function move(event: PointerEvent) {
    const active = session.current;
    if (!active || event.pointerId !== active.pointerId) return;
    const actions = candidates(active);
    if (!actions.length) {
      clear();
      return;
    }
    if (!active.started) {
      if (
        Math.hypot(
          event.clientX - active.startX,
          event.clientY - active.startY,
        ) < active.threshold
      )
        return;
      active.started = true;
      motion.current=motionDirector.play({cue:'dragFollow',id:`follow:${++dragSerial.current}`,scope:motionScope,hold:true,run:ctx=>ctx.addCleanup(()=>{if(session.current===active)clear()})});
      latest.current.onStart?.();
      active.element.classList.add("card-dragging-source");
      document.documentElement.classList.add("card-drag-in-progress");
      const clone = active.element.cloneNode(true) as HTMLElement;
      clone.classList.remove("card-dragging-source");
      remapCloneIds(clone);
      for (const el of [clone, ...clone.querySelectorAll<HTMLElement>("*")]) {
        for (const attribute of [
          "data-battle-id",
          "data-card-drag-source",
          "data-hand-id",
          "data-offer-id",
        ])
          el.removeAttribute(attribute);
        el.setAttribute("tabindex", "-1");
      }
      active.clone = clone;
      highlight(actions);
      try {
        active.element.setPointerCapture(active.pointerId);
      } catch {}
    }
    event.preventDefault();
    position.current={x:event.clientX,y:event.clientY};
    const drop = at(event.clientX, event.clientY),
      commands = commandsForDrop(actions, drop.location, latest.current.selfId);
    hovered.current?.classList.remove("card-drag-hover");
    hovered.current = commands.length
      ? drop.target &&
        commands.some((c) => c.targetId === drop.location.targetId)
        ? drop.target
        : drop.board
      : null;
    hovered.current?.classList.add("card-drag-hover");
    setGhost({
      clone: active.clone!,
      x: event.clientX,
      y: event.clientY,
      width: active.width,
      height: active.height,
      valid: commands.length > 0,
      needsTarget: dropNeedsTarget(commands, drop.location),
      contextClass: ["battle-fit", "in-tutorial"]
        .filter((name) =>
          latest.current.arenaRef.current?.classList.contains(name),
        )
        .join(" "),
      sourceKind: active.source.kind,
      label: active.source.label,
    });
  }
  function up(event: PointerEvent) {
    const active = session.current;
    if (!active || event.pointerId !== active.pointerId) return;
    if (!active.started) {
      session.current = null;
      return;
    }
    event.preventDefault();
    const drop = at(event.clientX, event.clientY),
      commands = commandsForDrop(
        candidates(active),
        drop.location,
        latest.current.selfId,
      ),
      label = active.source.label;
    if(!commands.length&&!getMotionPreferences().reduced&&active.clone){
      const original=active.element.getBoundingClientRect(),at=position.current,copy=active.clone.cloneNode(true) as HTMLElement;
      remapCloneIds(copy);copy.classList.add('card-drag-return','battle-fit');
      motionDirector.play({cue:'snapReturn',id:`return:${dragSerial.current}`,scope:motionScope,run:ctx=>{Object.assign(copy.style,{position:'fixed',left:(at.x-active.width/2)+'px',top:(at.y-active.height/2)+'px',width:active.width+'px',height:active.height+'px',pointerEvents:'none',zIndex:'86'});copy.setAttribute('aria-hidden','true');document.body.append(copy);ctx.addCleanup(()=>copy.remove());ctx.animate(copy,[{opacity:.8,transform:'translate(0,0)'},{opacity:0,transform:`translate(${original.left-at.x+active.width/2}px,${original.top-at.y+active.height/2}px)`}])}});
    }
    clear();
    if (commands.length)
      latest.current.onDrop(
        commands,
        label,
        dropNeedsTarget(commands, drop.location),
      );
  }
  const handlers = useRef({ move, up, clear });
  handlers.current = { move, up, clear };
  useEffect(() => {
    mounted.current = true;
    const onMove = (e: PointerEvent) => handlers.current.move(e),
      onUp = (e: PointerEvent) => handlers.current.up(e);
    const cancel = (e: PointerEvent) => {
      if (
        session.current?.pointerId === e.pointerId &&
        (e.type !== "lostpointercapture" ||
          e.target === session.current.element)
      )
        handlers.current.clear();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && session.current) {
        e.preventDefault();
        handlers.current.clear();
      }
    };
    const blur = () => handlers.current.clear(),
      visibility = () => {
        if (document.hidden) handlers.current.clear();
      };
    const click = (e: MouseEvent) => {
      if (performance.now() < suppressClickUntil.current) {
        suppressClickUntil.current = 0;
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    const newPointer = () => {
      suppressClickUntil.current = 0;
    };
    window.addEventListener("pointerdown", newPointer, true);
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp, { passive: false });
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("lostpointercapture", cancel);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", blur);
    window.addEventListener("resize", blur);
    document.addEventListener("fullscreenchange", blur);
    window.addEventListener("click", click, true);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mounted.current = false;
      handlers.current.clear(false);
      motionDirector.cancelScope(motionScope);
      window.removeEventListener("pointerdown", newPointer, true);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("lostpointercapture", cancel);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", blur);
      window.removeEventListener("resize", blur);
      document.removeEventListener("fullscreenchange", blur);
      window.removeEventListener("click", click, true);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (
      session.current &&
      (options.busy || session.current.epoch !== options.epoch)
    )
      clear();
  }, [options.busy, options.epoch]);
  function sourceProps(source: CardDragSource) {
    const enabled =
      !options.busy && dragActions(source, options.legalActions).length > 0;
    return {
      "data-card-drag-source": `${source.kind}:${source.id}`,
      "data-card-drag-enabled": String(enabled),
      style: {
        touchAction: enabled ? "none" : "auto",
        WebkitUserSelect: "none",
        userSelect: "none",
      } as const,
      draggable: false,
      onDragStartCapture: (event: ReactDragEvent<HTMLElement>) =>
        event.preventDefault(),
      onPointerDownCapture: (event: ReactPointerEvent<HTMLElement>) => {
        if (
          !enabled ||
          !event.isPrimary ||
          event.button !== 0 ||
          latest.current.busy
        )
          return;
        clear();
        const r = event.currentTarget.getBoundingClientRect();
        session.current = {
          source,
          element: event.currentTarget,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          threshold: event.pointerType === "touch" ? 12 : 8,
          epoch: latest.current.epoch,
          started: false,
          width: r.width,
          height: r.height,
        };
      },
    };
  }
  return {
    sourceProps,
    overlay: ghost ? <DragGhost ghost={ghost} /> : null,
    dragging: !!ghost,
    cancel: () => clear(),
  };
}
