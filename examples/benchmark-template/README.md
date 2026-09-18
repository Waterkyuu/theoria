# Theoria Benchmark template

This folder is a complete importable Benchmark example. In the Benchmark catalog, choose **Import folder** and select this directory, then assign a local Tag before creating the draft.

The example asks every selected Agent to summarize `orders.json` into `summary.json`. It demonstrates:

- a public starting file under `files/`;
- a built-in structural JSON check;
- a private Python validator with the fixed `validate(workspace)` entrypoint.

The Python validator returns only the documented public report shape. It receives the finished execution workspace as a `pathlib.Path`; it is not copied into the Agent's starting files.
