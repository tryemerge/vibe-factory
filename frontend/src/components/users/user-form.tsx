import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { User, CreateUser, UpdateUser } from 'shared/types'
import { makeRequest } from '@/lib/api'
import { AlertCircle } from 'lucide-react'

interface UserFormProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  user?: User | null
}

export function UserForm({ open, onClose, onSuccess, user }: UserFormProps) {
  const [email, setEmail] = useState(user?.email || '')
  // Password field removed since it's not in the backend API
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  const isEditing = !!user

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isEditing) {
        const updateData: UpdateUser = { 
          email: email !== user.email ? email : null,
        }
        
        // Remove null values
        Object.keys(updateData).forEach(key => {
          if (updateData[key as keyof UpdateUser] === null) {
            delete (updateData as any)[key]
          }
        })

        const response = await makeRequest(`/api/users/${user.id}`, {
          method: 'PUT',
          body: JSON.stringify(updateData),
        })
        
        if (!response.ok) {
          throw new Error('Failed to update user')
        }
      } else {
        const createData: CreateUser = { 
          email, 
        }
        
        const response = await makeRequest('/api/users', {
          method: 'POST',
          body: JSON.stringify(createData),
        })
        
        if (!response.ok) {
          if (response.status === 409) {
            throw new Error('A user with this email already exists')
          }
          throw new Error('Failed to create user')
        }
      }

      onSuccess()
      resetForm()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setEmail(user?.email || '')
    setError('')
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit User' : 'Create New User'}
          </DialogTitle>
          <DialogDescription>
            {isEditing 
              ? 'Make changes to the user account here. Click save when you\'re done.'
              : 'Add a new user to the system. They will be able to log in with these credentials.'
            }
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter email address"
              required
            />
          </div>

          {/* Password and admin fields removed since not supported by backend */}

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
            <Button type="submit" disabled={loading || !email.trim()}>
              {loading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create User'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
