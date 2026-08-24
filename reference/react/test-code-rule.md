## Test Code Writing Guidelines

The goal of testing is not to increase code coverage, but to verify user-observable behavior and business correctness.

Prioritize testing:

1. User-visible UI behavior
2. State changes after user interactions
3. API success/failure scenarios
4. Permissions, edge cases, and error flows
5. Core business rules

Do not test:

1. React internal implementation details
2. The current state storage mechanism
3. The number of times private functions are called
4. Behaviors already guaranteed by third-party libraries
5. Simple getters/setters

## How to Determine Whether Something Is Worth Testing

Before generating tests, first determine whether the logic has meaningful testing value.

If this test were removed:

* Could user behavior break?
* Could business logic regress?
* Could a core product flow be affected?

If the answer to all questions is **no**, do not generate the test.

## Component Testing Constraints

When testing React components:

Use the Testing Library approach.

Must use:

* `screen.getByRole`
* `screen.getByText`
* `userEvent`

Do not use:

* Querying by `className`
* Testing internal DOM structure
* Testing component hierarchy

## Async Logic Testing Constraints

For asynchronous code:

Must cover:

1. Loading state
2. Success state
3. Error state

Do not test:

* Promise resolution order
* Exact `setTimeout` timing
* Internal retry counts (unless required by business logic)

## Avoid Implementation Detail Testing

Do not write:

```tsx
expect(component.state.count).toBe(1)
```

Do not write:

```tsx
expect(setState).toHaveBeenCalled()
```

Do not write:

```tsx
expect(handleClick).toHaveBeenCalled()
```

Requirement:

Tests must verify behavior through user-observable outcomes.

Examples:

* User clicks a button → the displayed count increases
* User submits a form → a success message appears
* User enters invalid input → an error message is displayed

## Limit the Number of Tests

Generate no more than 3–5 core tests per component.

Only add more tests when at least one of the following applies:

* There are obvious business branches
* There is high-risk logic
* The behavior has caused regressions before
* There is a complex asynchronous workflow
