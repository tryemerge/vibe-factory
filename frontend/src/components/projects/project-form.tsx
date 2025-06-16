import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FolderPicker } from '@/components/ui/folder-picker'
import { Project, CreateProject, UpdateProject } from 'shared/types'
import { AlertCircle, Folder } from 'lucide-react'
import { makeAuthenticatedRequest } from '@/lib/auth'

interface ProjectFormProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  project?: Project | null
}

export function ProjectForm({ open, onClose, onSuccess, project }: ProjectFormProps) {
  const [name, setName] = useState(project?.name || '')
  const [gitRepoPath, setGitRepoPath] = useState(project?.git_repo_path || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showFolderPicker, setShowFolderPicker] = useState(false)

  const isEditing = !!project

  // Auto-populate project name from directory name
  const handleGitRepoPathChange = (path: string) => {
    setGitRepoPath(path)
    
    // Only auto-populate name for new projects
    if (!isEditing && path) {
      // Extract the last part of the path (directory name)
      const dirName = path.split('/').filter(Boolean).pop() || ''
      if (dirName) {
        // Clean up the directory name for a better project name
        const cleanName = dirName
          .replace(/[-_]/g, ' ') // Replace hyphens and underscores with spaces
          .replace(/\b\w/g, l => l.toUpperCase()) // Capitalize first letter of each word
        setName(cleanName)
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isEditing) {
        const updateData: UpdateProject = { 
          name,
          git_repo_path: gitRepoPath
        }
        const response = await makeAuthenticatedRequest(`/api/projects/${project.id}`, {
          method: 'PUT',
          body: JSON.stringify(updateData),
        })
        
        if (!response.ok) {
          throw new Error('Failed to update project')
        }
      } else {
        const createData: CreateProject = { 
          name,
          git_repo_path: gitRepoPath
        }
        const response = await makeAuthenticatedRequest('/api/projects', {
          method: 'POST',
          body: JSON.stringify(createData),
        })
        
        if (!response.ok) {
          throw new Error('Failed to create project')
        }
      }

      onSuccess()
      setName('')
      setGitRepoPath('')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setName(project?.name || '')
    setGitRepoPath(project?.git_repo_path || '')
    setError('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Project' : 'Create New Project'}
          </DialogTitle>
          <DialogDescription>
            {isEditing 
              ? 'Make changes to your project here. Click save when you\'re done.'
              : 'First, select the git repository path. The project name will be auto-populated from the directory name.'
            }
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="git-repo-path">Git Repository Path</Label>
            <div className="flex space-x-2">
              <Input
                id="git-repo-path"
                type="text"
                value={gitRepoPath}
                onChange={(e) => handleGitRepoPathChange(e.target.value)}
                placeholder="/path/to/your/project"
                required
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowFolderPicker(true)}
              >
                <Folder className="h-4 w-4" />
              </Button>
            </div>
            {!isEditing && (
              <p className="text-sm text-muted-foreground">
                The project name will be auto-populated from the directory name
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Project Name</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter project name"
              required
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name.trim() || !gitRepoPath.trim()}>
              {loading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      
      <FolderPicker
        open={showFolderPicker}
        onClose={() => setShowFolderPicker(false)}
        onSelect={(path) => {
          handleGitRepoPathChange(path)
          setShowFolderPicker(false)
        }}
        value={gitRepoPath}
        title="Select Git Repository Path"
        description="Choose or create a folder for your git repository"
      />
    </Dialog>
  )
}
