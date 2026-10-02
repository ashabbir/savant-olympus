import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AppVariablesManager } from "../components/shared/AppVariablesManager";

const mockVariablesResponse = {
  variables: {
    GITHUB_TOKEN: "ghp_mock_secret",
  },
  effective: {
    GITHUB_TOKEN: {
      key: "GITHUB_TOKEN",
      is_set: true,
      source: "db" as const,
      db_configured: true,
      env_configured: false,
    },
    GITLAB_TOKEN: {
      key: "GITLAB_TOKEN",
      is_set: false,
      source: "none" as const,
      db_configured: false,
      env_configured: false,
    },
  },
};

describe("AppVariablesManager", () => {
  let fetchMock: any;

  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock = vi.fn().mockImplementation((url: string, opts?: any) => {
      if (url.includes("/api/app-variables") && (!opts || opts.method === "GET" || !opts.method)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockVariablesResponse),
        });
      }
      if (opts?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: "saved" }),
        });
      }
      if (opts?.method === "DELETE") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: "deleted" }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders variables and effective token cards", async () => {
    render(<AppVariablesManager serverUrl="http://localhost:8090" apiKey="test-key" />);

    expect(await screen.findByText("App Variables (Database Key-Value Store)")).toBeInTheDocument();
    expect(await screen.findByText("Active: Database")).toBeInTheDocument();
    expect(await screen.findByText("Not Configured")).toBeInTheDocument();
    expect(screen.getAllByText("GITHUB_TOKEN").length).toBeGreaterThanOrEqual(1);
  });

  it("adds a new key-value pair and invokes callback", async () => {
    const onVariablesChanged = vi.fn();
    render(
      <AppVariablesManager
        serverUrl="http://localhost:8090"
        apiKey="test-key"
        onVariablesChanged={onVariablesChanged}
      />
    );

    await screen.findByText("App Variables (Database Key-Value Store)");

    const keyInput = screen.getByPlaceholderText("KEY (e.g. GITHUB_TOKEN)");
    const valInput = screen.getByPlaceholderText("VALUE (e.g. ghp_xxxxxxxxxxxx)");

    fireEvent.change(keyInput, { target: { value: "CUSTOM_VAR" } });
    fireEvent.change(valInput, { target: { value: "custom_value" } });

    const saveButton = screen.getByRole("button", { name: /save kv/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:8090/api/app-variables",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ key: "CUSTOM_VAR", value: "custom_value" }),
        })
      );
    });

    await waitFor(() => {
      expect(onVariablesChanged).toHaveBeenCalled();
    });
  });

  it("deletes a variable when remove button is clicked", async () => {
    const onVariablesChanged = vi.fn();
    render(
      <AppVariablesManager
        serverUrl="http://localhost:8090"
        apiKey="test-key"
        onVariablesChanged={onVariablesChanged}
      />
    );

    const removeButton = await screen.findByTitle("Remove GITHUB_TOKEN");
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:8090/api/app-variables/GITHUB_TOKEN",
        expect.objectContaining({ method: "DELETE" })
      );
    });

    await waitFor(() => {
      expect(onVariablesChanged).toHaveBeenCalled();
    });
  });
});
