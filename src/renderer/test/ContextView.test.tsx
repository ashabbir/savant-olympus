import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ContextView } from '../components/tabs/ContextView'

// Mock Electron API
const mockListDirectory = vi.fn();
const mockPickDirectory = vi.fn();

(window as any).electronAPI = {
  listDirectory: mockListDirectory,
  pickDirectory: mockPickDirectory,
};

describe('ContextView - FileBrowserModal Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    vi.spyOn(window, 'fetch').mockImplementation((url) => {
      const u = url.toString()
      if (u.includes('/api/context/repos/sources')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            sources: {
              directory: {
                enabled: true,
                base_dir: "/base-code",
                base_host_dir: "/Users/home/code"
              }
            }
          })
        } as Response)
      }
      if (u.includes('/api/context/repos')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ repos: [] })
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({})
      } as Response)
    })
  })

  it('opens FileBrowserModal when BROWSE button is clicked', async () => {
    render(<ContextView serverUrl="http://127.0.0.1:8090" apiKey="test-key" onSelectProject={() => {}} selectedProject={null} />)
    
    // Open Register modal
    const registerBtn = screen.getByText(/REGISTER REPOSITORY/i)
    fireEvent.click(registerBtn)
    
    // Select Local Directory source
    await waitFor(() => {
      const select = screen.getByLabelText(/Select Source/i)
      fireEvent.change(select, { target: { value: 'directory' } })
    })

    // Click BROWSE
    const browseBtn = screen.getByText(/BROWSE/i)
    fireEvent.click(browseBtn)

    // Check if FileBrowserModal is visible
    expect(screen.getByText(/\/\/ BROWSE SERVER DIRECTORY/i)).toBeInTheDocument()
    await waitFor(() => {
      expect(mockListDirectory).toHaveBeenCalled()
    })
  })

  it('navigates directories and selects a path', async () => {
    mockListDirectory.mockResolvedValue([
      { name: "project-a", isDirectory: true, path: "/Users/home/code/project-a" },
      { name: "project-b", isDirectory: true, path: "/Users/home/code/project-b" },
    ]);

    render(<ContextView serverUrl="http://127.0.0.1:8090" apiKey="test-key" onSelectProject={() => {}} selectedProject={null} />)
    
    // Open modals
    fireEvent.click(screen.getByText(/REGISTER REPOSITORY/i))
    await waitFor(() => {
      fireEvent.change(screen.getByLabelText(/Select Source/i), { target: { value: 'directory' } })
    })
    fireEvent.click(screen.getByText(/BROWSE/i))

    // Wait for directory entries
    await waitFor(() => {
      expect(screen.getByText("project-a")).toBeInTheDocument()
    })

    // Click on project-a to navigate
    mockListDirectory.mockResolvedValueOnce([
      { name: "src", isDirectory: true, path: "/Users/home/code/project-a/src" },
    ]);
    fireEvent.click(screen.getByText("project-a"))

    await waitFor(() => {
      expect(screen.getByText("src")).toBeInTheDocument()
      // Check that the path is shown somewhere (breadcrumb or footer)
      expect(screen.getAllByText(/\/Users\/home\/code\/project-a/i).length).toBeGreaterThan(0)
    })

    // Select current directory
    fireEvent.click(screen.getByText(/Select Directory/i))

    // Check if ContextView's input is updated with relative path
    const input = screen.getByPlaceholderText("team/project") as HTMLInputElement
    expect(input.value).toBe("project-a")
  })
})
