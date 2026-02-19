import { useSubmission, type RouteSectionProps } from "@solidjs/router";
import { Show } from "solid-js";
import { Motion, Presence } from "solid-motionone";
import { login } from "~/lib/auth";
import { Button } from "~/components/Button";
import { Alert } from "~/components/Alert";
import { Fieldset, Label } from "~/components/Fieldset";
import {
  elasticOut,
  smoothOut,
  springGentle,
  springMedium,
  springBouncy,
  inputFocus,
  cardHover,
} from "~/components/motion/constants";


export const LOGIN_ROUTE = "/login";

// -- Animation Configuration --

const EASING = {
  elasticOut,
  smoothOut,
  linear: "linear" as const,
} as const;

const TIMING = {
  formEntry: 0.8,
  blur: 0.6,
  shimmer: 2,
  title: 0.7,
  field: 0.6,
  button: 0.7,
  error: 0.4,
  backgroundRotation: 20,
  particleSlow: 4,
  particleMedium: 5,
  particleFast: 6,
} as const;

const DELAYS = {
  blur: 0.2,
  shimmer: 0.5,
  title: 0.3,
  usernameField: 0.5,
  usernameInput: 0.7,
  passwordField: 0.65,
  passwordInput: 0.85,
  button: 0.85,
  errorContent: 0.1,
  particles: [0, 0.5, 1] as const,
} as const;

// -- Reusable Animation Presets --

const animations = {
  formContainer: {
    initial: { opacity: 0, scale: 0.8, rotateY: -15, z: -200 },
    animate: { opacity: 1, scale: 1, rotateY: 0, z: 0 },
    exit: { opacity: 0, scale: 0.9, rotateY: 15, z: -200 },
    transition: { duration: TIMING.formEntry, easing: EASING.elasticOut },
  },
  blur: {
    initial: { filter: "blur(10px)" },
    animate: { filter: "blur(0px)" },
    transition: { duration: TIMING.blur, delay: DELAYS.blur },
  },
  shimmer: {
    initial: { x: "-100%" },
    animate: { x: "200%" },
    transition: {
      duration: TIMING.shimmer,
      delay: DELAYS.shimmer,
      easing: EASING.smoothOut,
    },
  },
  title: {
    initial: { opacity: 0, y: -30, rotateX: -90 },
    animate: { opacity: 1, y: 0, rotateX: 0 },
    transition: {
      duration: TIMING.title,
      delay: DELAYS.title,
      ...springMedium,
    },
  },
  fieldContainer: (delay: number) => ({
    initial: { opacity: 0, x: -50, rotateY: -20 },
    animate: { opacity: 1, x: 0, rotateY: 0 },
    transition: { duration: TIMING.field, delay, ...springGentle },
  }),
  input: (delay: number) => ({
    initial: { scale: 0.95 },
    animate: { scale: 1 },
    transition: { duration: 0.3, delay },
    ...inputFocus,
  }),
  button: {
    initial: { opacity: 0, y: 30, scale: 0.8 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: {
      duration: TIMING.button,
      delay: DELAYS.button,
      ...springBouncy,
    },
  },
  buttonInteractive: cardHover,
  error: {
    initial: { opacity: 0, height: 0, y: -20 },
    animate: { opacity: 1, height: "auto", y: 0 },
    exit: { opacity: 0, height: 0, y: -10 },
    transition: { duration: TIMING.error, ...springGentle },
  },
  errorContent: {
    initial: { x: -10 },
    animate: { x: 0 },
    transition: { duration: 0.3, delay: DELAYS.errorContent },
  },
} as const;

// -- Styled Components --

function AnimatedBackground() {
  return (
    <>
      {/* Rotating gradient */}
      <Motion.div
        initial={{ opacity: 0, scale: 0.8, rotate: 0 }}
        animate={{ opacity: 0.15, scale: 1.2, rotate: 360 }}
        transition={{
          duration: TIMING.backgroundRotation,
          easing: EASING.linear,
          repeat: Infinity,
        }}
        class="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, oklch(var(--p)) 0%, transparent 70%)",
        }}
      />

      {/* Floating particles */}
      <Motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6 }}
        transition={{ duration: 1, delay: 1 }}
        class="absolute inset-0 pointer-events-none"
      >
        <FloatingParticle
          delay={DELAYS.particles[0]}
          duration={TIMING.particleSlow}
          yRange={[-20, 0]}
          xRange={[10, 0]}
          class="top-1/4 left-1/4 w-2 h-2 bg-primary/30"
        />
        <FloatingParticle
          delay={DELAYS.particles[1]}
          duration={TIMING.particleMedium}
          yRange={[15, 0]}
          xRange={[-15, 0]}
          class="top-1/3 right-1/4 w-3 h-3 bg-secondary/30"
        />
        <FloatingParticle
          delay={DELAYS.particles[2]}
          duration={TIMING.particleFast}
          yRange={[-25, 0]}
          xRange={[20, 0]}
          class="bottom-1/3 left-1/3 w-2 h-2 bg-accent/30"
        />
      </Motion.div>
    </>
  );
}

function FloatingParticle(props: {
  delay: number;
  duration: number;
  yRange: [number, number];
  xRange: [number, number];
  class: string;
}) {
  return (
    <Motion.div
      animate={{ y: [0, ...props.yRange], x: [0, ...props.xRange] }}
      transition={{
        duration: props.duration,
        repeat: Infinity,
        delay: props.delay,
        easing: EASING.smoothOut,
      }}
      class={`absolute rounded-full blur-sm ${props.class}`}
    />
  );
}

function ShimmerEffect() {
  return (
    <Motion.div
      {...animations.shimmer}
      class="absolute inset-0 pointer-events-none"
      style={{
        background:
          "linear-gradient(90deg, transparent, oklch(var(--p) / 0.1), transparent)",
        width: "50%",
      }}
    />
  );
}

function AnimatedInput(props: {
  id: string;
  name: string;
  type: string;
  placeholder: string;
  delay: number;
  autocomplete?: string;
  required?: boolean;
}) {
  return (
    <Motion.input
      {...animations.input(props.delay)}
      id={props.id}
      name={props.name}
      type={props.type}
      placeholder={props.placeholder}
      class="input w-full"
      required={props.required}
      autocomplete={props.autocomplete}
    />
  );
}

export default function Login(props: RouteSectionProps) {
  const loggingIn = useSubmission(login);

  return (
    <main class="min-h-screen flex items-center justify-center bg-base-200 overflow-hidden">
      <AnimatedBackground />

      {/* Main form container with 3D perspective */}
      <Motion.div
        {...animations.formContainer}
        style={{ "transform-style": "preserve-3d", perspective: "1000px" }}
      >
        <form action={login} method="post">
          <Motion.div {...animations.blur}>
            <Fieldset class="bg-base-100 border-base-300 rounded-box w-xs border-2 p-6 shadow-2xl relative overflow-hidden">
              <ShimmerEffect />

              {/* Title with dramatic entrance */}
              <Motion.div {...animations.title}>
                <Fieldset.Legend class="text-2xl">
                  PDS Agent
                </Fieldset.Legend>
              </Motion.div>

              <input
                type="hidden"
                name="redirectTo"
                value={props.params.redirectTo ?? "/"}
              />

              {/* Username field */}
              <Motion.div {...animations.fieldContainer(DELAYS.usernameField)}>
                <Label>Username</Label>
                <AnimatedInput
                  id="username-input"
                  name="username"
                  type="text"
                  placeholder="Enter username"
                  delay={DELAYS.usernameInput}
                  autocomplete="username"
                  required
                />
              </Motion.div>

              {/* Password field */}
              <Motion.div {...animations.fieldContainer(DELAYS.passwordField)}>
                <Label>Password</Label>
                <AnimatedInput
                  id="password-input"
                  name="password"
                  type="password"
                  placeholder="Enter password"
                  delay={DELAYS.passwordInput}
                  autocomplete="current-password"
                  required
                />
              </Motion.div>

              {/* Submit button */}
              <Motion.div {...animations.button}>
                <Motion.div {...animations.buttonInteractive}>
                  <Button
                    type="submit"
                    class="w-full mt-4"
                    color="primary"
                    disabled={loggingIn.pending}
                  >
                    <Show when={loggingIn.pending} fallback="Continue">
                      <Motion.span
                        class="loading loading-spinner"
                        animate={{ rotate: 360 }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          easing: EASING.linear,
                        }}
                      />
                    </Show>
                  </Button>
                </Motion.div>
              </Motion.div>

              {/* Error alert */}
              <Presence>
                <Show when={loggingIn.result}>
                  <Motion.div {...animations.error}>
                    <Alert color="error" class="mt-4">
                      <Motion.span
                        role="alert"
                        id="error-message"
                        {...animations.errorContent}
                      >
                        {loggingIn.result!.message}
                      </Motion.span>
                    </Alert>
                  </Motion.div>
                </Show>
              </Presence>
            </Fieldset>
          </Motion.div>
        </form>
      </Motion.div>
    </main>
  );
}
