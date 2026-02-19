import { tv } from "tailwind-variants";
import { splitProps, children, JSX } from "solid-js";

export const buttonVariants = tv({
  base: "btn",
  variants: {
    variant: {
      default: "",
      outline: "btn-outline",
      soft: "btn-soft",
      dash: "btn-dash",
      ghost: "btn-ghost",
      link: "btn-link",
    },
    color: {
      default: "",
      neutral: "btn-neutral",
      primary: "btn-primary",
      secondary: "btn-secondary",
      accent: "btn-accent",
      info: "btn-info",
      success: "btn-success",
      warning: "btn-warning",
      error: "btn-error",
    },
    size: {
      xs: "btn-xs",
      sm: "btn-sm",
      md: "",
      lg: "btn-lg",
      xl: "btn-xl",
    },
    shape: {
      default: "",
      square: "btn-square",
      circle: "btn-circle",
    },
    width: {
      default: "",
      wide: "btn-wide",
      block: "btn-block",
    },
    state: {
      default: "",
      active: "btn-active",
      disabled: "btn-disabled",
    },
  },
  defaultVariants: {
    variant: "default",
    color: "default",
    size: "md",
    shape: "default",
    width: "default",
    state: "default",
  },
});

type ButtonVariants = Parameters<typeof buttonVariants>[0];

export type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> &
  ButtonVariants;

export const Button = (props: ButtonProps) => {
  const [local, others] = splitProps(props, [
    "variant",
    "color",
    "size",
    "shape",
    "width",
    "state",
    "class",
    "children",
  ]);

  const safeChildren = children(() => local.children);

  return (
    <button
      {...others}
      class={buttonVariants({
        variant: local.variant,
        color: local.color,
        size: local.size,
        shape: local.shape,
        width: local.width,
        state: local.state,
        class: local.class,
      })}
    >
      {safeChildren()}
    </button>
  );
};
