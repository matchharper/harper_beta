"use client";

import * as React from "react";
import { useIsMobile } from "@/hooks/useMediaQuery";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./dialog";
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "./drawer";

export type ResponsiveDialogVariant = "dialog" | "drawer";

export type ResponsiveDialogProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  forceVariant?: ResponsiveDialogVariant;
  dialogContentClassName?: string;
  drawerContentClassName?: string;
  bodyClassName?: string;
  hideCloseButton?: boolean;
};

export function ResponsiveDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  forceVariant,
  dialogContentClassName,
  drawerContentClassName,
  bodyClassName,
  hideCloseButton,
}: ResponsiveDialogProps) {
  const isMobile = useIsMobile();
  const variant: ResponsiveDialogVariant =
    forceVariant ?? (isMobile ? "drawer" : "dialog");

  if (variant === "drawer") {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        {trigger ? <DrawerTrigger asChild>{trigger}</DrawerTrigger> : null}
        <DrawerContent className={drawerContentClassName}>
          {(title || description) && (
            <DrawerHeader>
              {title ? <DrawerTitle>{title}</DrawerTitle> : null}
              {description ? (
                <DrawerDescription>{description}</DrawerDescription>
              ) : null}
            </DrawerHeader>
          )}
          <div className={bodyClassName ?? "px-4 pb-4"}>{children}</div>
          {footer ? <DrawerFooter>{footer}</DrawerFooter> : null}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        className={dialogContentClassName}
        hideCloseButton={hideCloseButton}
      >
        {(title || description) && (
          <DialogHeader>
            {title ? <DialogTitle>{title}</DialogTitle> : null}
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>
        )}
        <div className={bodyClassName}>{children}</div>
        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}
