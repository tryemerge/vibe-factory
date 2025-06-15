import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Project, CreateProject, UpdateProject, GitProvider } from 'shared/types'
import { AlertCircle } from 'lucide-react'
import { makeAuthenticatedRequest } from '@/lib/auth'

interface ProjectFormProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  project?: Project | null
}

export function ProjectForm({ open, onClose, onSuccess, project }: ProjectFormProps) {
  const [name, setName] = useState(project?.name || '')
  const [repoUrl, setRepoUrl] = useState(project?.repo_url || '')
  const [repoProvider, setRepoProvider] = useState<GitProvider>(project?.repo_provider || 'Github')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isEditing = !!project

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isEditing) {
        const updateData: UpdateProject = { 
          name,
          repo_url: repoUrl,
          repo_provider: repoProvider,
          git_credential_id: null // TODO: Allow credential selection
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
          repo_url: repoUrl,
          repo_provider: repoProvider,
          git_credential_id: null // TODO: Allow credential selection
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
      setRepoUrl('')
      setRepoProvider('Github')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setName(project?.name || '')
    setRepoUrl(project?.repo_url || '')
    setRepoProvider(project?.repo_provider || 'Github')
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
              : 'Add a new project to your workspace. You can always edit it later.'
            }
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div className="space-y-2">
            <Label htmlFor="repo_url">Repository URL</Label>
            <Input
              id="repo_url"
              type="url"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/username/repository"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="repo_provider">Git Provider</Label>
            <Select value={repoProvider} onValueChange={(value: GitProvider) => setRepoProvider(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a git provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Github">GitHub</SelectItem>
                <SelectItem value="Gitlab">GitLab</SelectItem>
                <SelectItem value="Bitbucket">Bitbucket</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
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
            <Button type="submit" disabled={loading || !name.trim() || !repoUrl.trim()}>
              {loading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
