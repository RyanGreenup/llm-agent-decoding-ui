import type { JSX } from "solid-js";
import { createContext, createUniqueId, useContext } from "solid-js";
import { tv } from "tailwind-variants";

// -- Context ------------------------------------------------------------------

interface DrawerContextValue {
  toggleId: string;
}

const DrawerContext = createContext<DrawerContextValue>();

function useDrawerContext() {
  const ctx = useContext(DrawerContext);
  if (!ctx)
    throw new Error("Drawer.* components must be used within <DrawerLayout>");
  return ctx;
}

// -- Styles -------------------------------------------------------------------

const drawer = tv({
  slots: {
    root: [
      "flex flex-col", // vertical stack: topbar then content
      "h-dvh", // fill viewport
      "relative", // anchor for absolutely-positioned sidebar
      "[--navbar-h:5rem]", // shared height token for topbar/sidebar offset
      "[--drawer-duration:300ms]", // transition duration for all drawer animations
      "[--drawer-ease:ease]", // transition easing for all drawer animations
    ],
    topBar: [
      "w-full h-(--navbar-h)", // full width, height from token
      "shrink-0", // don't compress when content overflows
      "flex items-center px-2", // layout for toggle + children
    ],
    toggle: [
      "cursor-pointer", // label needs explicit cursor
    ],
    main: [
      "flex-1", // fill remaining vertical space
      "overflow-y-auto", // scroll content independently
      "transition-[margin] duration-(--drawer-duration) ease-(--drawer-ease)", // animate only margin shift
      "md:ml-50", // desktop: offset for visible sidebar
      "md:peer-checked:ml-0", // desktop: reclaim space when sidebar collapses
    ],
    overlay: [
      "z-10", // above content, below sidebar
      "fixed inset-0 top-(--navbar-h)", // cover viewport below topbar
      "cursor-default", // no pointer affordance — it's a dismiss target
      "opacity-0 pointer-events-none", // hidden by default
      "transition-opacity duration-(--drawer-duration) ease-(--drawer-ease)", // fade in/out
      "peer-checked:opacity-100 peer-checked:pointer-events-auto", // visible when drawer open
      "md:hidden", // desktop doesn't need overlay
    ],
    sidebar: [
      "z-20", // above overlay
      "absolute top-(--navbar-h) bottom-0 left-0", // positioned below topbar
      "w-50", // sidebar width
      "overflow-y-auto", // scroll sidebar content independently
      "transition-transform duration-(--drawer-duration) ease-(--drawer-ease)", // slide animation
      "-translate-x-full", // mobile: hidden off-screen by default
      "peer-checked:translate-x-0", // mobile: slide in when open
      "md:translate-x-0", // desktop: visible by default
      "md:peer-checked:-translate-x-full", // desktop: slide out when toggled
    ],
  },
  variants: {
    theme: {
      daisyui: {
        topBar: "navbar bg-base-100 shadow-sm border-b border-base-300", // daisyUI navbar surface
        toggle: "btn btn-square btn-ghost", // daisyUI square ghost button
        overlay: "bg-black/50", // dim background
        sidebar: "bg-base-200 border-r border-base-300", // daisyUI sidebar surface
      },
      dev: {
        topBar: "bg-green-600/50", // visualize topbar bounds
        main: "bg-red-600/50", // visualize content bounds
        sidebar: "bg-blue-600/50", // visualize sidebar bounds
        overlay: "bg-black/50", // dim background
      },
    },
  },
  defaultVariants: {
    theme: "daisyui",
  },
});

const styles = drawer();

// -- Components ---------------------------------------------------------------

/** Root layout: provides drawer context, renders the hidden checkbox and overlay. */
export function DrawerLayout(props: { children: JSX.Element }) {
  const toggleId = createUniqueId();

  return (
    <DrawerContext.Provider value={{ toggleId }}>
      <div class={styles.root()}>
        <input type="checkbox" id={toggleId} class="peer hidden" />
        {props.children}
        <DrawerOverlay />
      </div>
    </DrawerContext.Provider>
  );
}

/** Top bar with a built-in toggle button. Additional children render after the button. */
export function DrawerTopBar(props: { children?: JSX.Element }) {
  const { toggleId } = useDrawerContext();

  return (
    <div class={styles.topBar()}>
      <label for={toggleId} class={styles.toggle()}>
        ☰
      </label>
      {props.children}
    </div>
  );
}

/** Main content area. Shifts right on desktop to make room for the sidebar. */
export function DrawerMain(props: { children?: JSX.Element }) {
  useDrawerContext();
  return <div class={styles.main()}>{props.children}</div>;
}

/** Translucent overlay. Clicking it closes the drawer. Mobile only. Rendered internally by DrawerLayout. */
function DrawerOverlay() {
  const { toggleId } = useDrawerContext();
  return <label for={toggleId} class={styles.overlay()} />;
}

/** Sliding sidebar drawer. Overlays on mobile, inline on desktop. */
export function DrawerSidebar(props: { children?: JSX.Element }) {
  useDrawerContext();
  return <div class={styles.sidebar()}>{props.children}</div>;
}
