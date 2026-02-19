import type { RouteSectionProps } from "@solidjs/router";
import { Suspense } from "solid-js";
import { createProtectedRoute } from "~/lib/auth";
import {
  DrawerLayout,
  DrawerTopBar,
  DrawerMain,
  DrawerSidebar,
} from "~/components/Drawer";
import Nav, { SidebarNav } from "~/components/Nav";

export default function AppLayout(props: RouteSectionProps) {
  createProtectedRoute();

  return (
    <DrawerLayout>
      <DrawerTopBar>
        <Nav />
      </DrawerTopBar>
      <DrawerMain>
        <Suspense>{props.children}</Suspense>
      </DrawerMain>
      <DrawerSidebar>
        <SidebarNav />
      </DrawerSidebar>
    </DrawerLayout>
  );
}
