# Component guidelines

## Component design and ownership

- Prefer focused function components. Keep render and hooks pure, pass props as read-only inputs, and let React call components through JSX. Call hooks such as `useState` and custom hooks at the top level of a component or hook, before conditional returns. See the [Rules of React](https://react.dev/reference/rules).
- Keep route and feature components responsible for data, app-specific copy, and workflow decisions. Put request details in feature adapters and use hooks or a route to connect data to the UI. Keep straightforward interaction logic with its markup. See [API design](api-design.md#ownership-and-file-layout).
- Split a component when parts change independently, have distinct interaction contracts, or can be tested more clearly on their own. Use responsibility and readability to guide extraction, regardless of line count.

### Placement and naming

| Owner               | Where components belong                                                                |
| ------------------- | -------------------------------------------------------------------------------------- |
| Route or app        | Page composition, app providers, shell layout, navigation, and translated app copy.    |
| Feature             | UI with feature terminology, state, or business rules under `src/features/<feature>/`. |
| App-local shared UI | Domain-independent UI reused across multiple features (`src/shared/components/`).      |

```text
src/
├── features/users/components/
│   ├── UserTable.tsx
│   ├── UserForm.tsx
│   └── UserForm.test.tsx
└── shared/components/
    └── Button.tsx
```

Use PascalCase identifiers for components. Vite apps use `ComponentName.tsx` and `useSomething.ts` for custom hooks. See [Coding standards](coding-standards.md#naming).

Use explicit public exports when another feature needs a supported component or type. Keep public re-exports at the owning boundary. See [Architecture](architecture.md#imports-and-cross-feature-communication) and [Feature structure](feature-structure.md#boundaries-and-public-apis).

## Props and refs

- Define named prop types for reusable contracts and infer return types where clear. Base native wrappers on the element they render, using `ComponentPropsWithRef<'button'>` when forwarding a ref or `ComponentPropsWithoutRef` when there is no supported ref. Forward native attributes, including form, event, and ARIA props, to that element.
- Use discrete `variant` and `size` options for visual alternatives. Keep independent flags such as `disabled` and `loading` and define how they interact. Use a discriminated union when one mode requires props that are invalid in another.
- For fields, let the parent drive a controlled `value` or `checked` with an update handler, or initialize an uncontrolled field with `defaultValue` or `defaultChecked`. Keep that ownership stable for the field's lifetime. See [React input props](https://react.dev/reference/react-dom/components/input).
- Components target React 19: accept `ref` as a prop and pass it to the underlying element (avoid new `forwardRef` wrappers). Return a cleanup function from a ref callback when detaching observers or event listeners. See [React 19 ref as a prop](https://react.dev/blog/2024/12/05/react-19#ref-as-a-prop).

```tsx
import type { ComponentPropsWithRef } from 'react';

type SearchInputProps = Pick<
  ComponentPropsWithRef<'input'>,
  'name' | 'disabled' | 'placeholder' | 'ref' | 'aria-describedby'
>;

type SearchFieldMode =
  | {
      mode: 'controlled';
      value: string;
      onValueChange: (value: string) => void;
      defaultValue?: never;
    }
  | {
      mode: 'uncontrolled';
      defaultValue?: string;
      value?: never;
      onValueChange?: never;
    };

type SearchFieldProps = SearchInputProps & SearchFieldMode & { label: string };

export function SearchField({
  label,
  mode,
  value,
  defaultValue,
  onValueChange,
  ...inputProps
}: SearchFieldProps) {
  return (
    <label>
      {label}
      <input
        {...inputProps}
        type="search"
        value={value}
        defaultValue={defaultValue}
        onChange={
          mode === 'controlled' ? (event) => onValueChange(event.currentTarget.value) : undefined
        }
      />
    </label>
  );
}
```

## Reuse, hooks, and composition

- Compose primitives through children and props rather than adding feature-specific props to shared controls.
- Use named slots when callers need to fill distinct regions such as actions and content. Consider compound components only when separately composed parts must coordinate state or behavior. Keep explicit props for nearby consumers and consider scoped context when distant descendants share a concern.
- Keep local state with its consumers. Compute derived values during render and use effects strictly for external synchronization. On React 19.2+, use `useEffectEvent` for non-reactive callbacks read inside Effects. Render `<Context value={...}>` directly rather than `<Context.Provider>`. See [State management](state-management.md#choosing-a-state-owner).
- Extract a custom hook when stateful behavior has a clear interface or needs to be reused. Keep feature hooks in their feature.

## Styling, themes, and variants

- Use Tailwind CSS v4's CSS-first setup and semantic `--ui-*` / `ui-*` tokens (`bg-ui-surface`, `text-ui-text`, `text-ui-text-muted`, `border-ui-border`, `bg-ui-accent`, `text-ui-error`).
- Map typed variants to complete static class names or CSS Module classes—never construct dynamic Tailwind utility names via string interpolation (such as `` `bg-${color}-500` ``), which prevents Tailwind CSS v4 source detection from emitting the class. For icon libraries such as `lucide-react`, use direct named imports and mark decorative icons with `aria-hidden="true"`. See [Tailwind source detection](https://tailwindcss.com/docs/detecting-classes-in-source-files) and [theme variables](https://tailwindcss.com/docs/theme).
- When exposing `className`, document which element receives it. Place CSS Module defaults inside `@layer components` when consumer utilities should override defaults cleanly.
- Start with a narrow layout, let labels wrap, and verify both light and dark themes via `data-ui-theme` on the document root.

## Interaction and accessibility

- Use native semantics for controls and landmarks (`<header>`, `<nav>`, `<main>`, `<footer>`, `<button type="button">`, `<a href>`). Render only one `<main>` landmark per page—when a layout shell (such as `<Outlet />` or layout `children`) owns `<main>`, child and fallback/not-found views render `<section>` or `<div>` instead of a nested `<main>`. Provide keyboard access and visible, unobscured focus. Give fields visible labels, name icon-only controls, hide decorative icons, and use ARIA only where native markup does not express the state. Associate validation messages with the field using `aria-describedby` and mark invalid fields with `aria-invalid`.
- Preserve loading, empty, error, disabled, and invalid states. Use native `disabled` when available. Keep the action's accessible name during loading (`aria-busy="true"`) and announce asynchronous updates with a persistent status region (`role="status"`). Reserve `role="alert"` for urgent messages. See [WCAG 2.2](https://www.w3.org/TR/WCAG22/).
- Give modal dialogs an accessible title (`aria-labelledby`), intentional initial focus, Tab and Shift+Tab containment, Escape dismissal, a visible close button, focus restoration to the trigger, and background isolation (`inert` or equivalent). See the [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
- Keep layouts and theme or language controls usable at narrow viewport widths, and preserve `prefers-reduced-motion` behavior.
- In localized apps using `i18next`, keep translation keys static, avoid fragment concatenation, translate accessible names and validation errors alongside visible copy, and update all configured locale resources together.

## Testing and performance

- Test user-visible behavior with Vitest and React Testing Library. Query by role and accessible name, reuse required providers, and assert the effect of user actions. See [Testing strategy](testing-strategy.md#frontend-validation).
- Keep updates scoped to the components that need them. Measure before adding memoization or lazy loading. See [Performance](performance.md).

## Anti-patterns and incremental adoption

| Pattern to avoid                                                             | Preferred approach                                                                                      |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| One component owns unrelated presentation, data access, and workflows        | Compose focused views and keep requests and business operations in the owning feature.                  |
| A generalized primitive has feature-specific rules, or many boolean variants | Keep workflow composition in the feature. Use typed variants and a small composition API for shared UI. |
| Effects mirror props, query results, or render-time calculations into state  | Keep one owner. Derive display values during render and use an explicit draft when editing.             |
| Memoization added by default                                                 | Profile the interaction and fix the update source first.                                                |
| Internal files import their own public barrel, creating a cycle              | Import sibling files directly and reserve the barrel for external callers.                              |
| A clickable generic element imitates a control                               | Use a native button or link with keyboard and focus behavior built in.                                  |

Apply these conventions to new or substantially modified components. Keep working code in place until there is a reason to change it, and preserve public props, refs, interaction, and visual behavior during incremental extraction.
