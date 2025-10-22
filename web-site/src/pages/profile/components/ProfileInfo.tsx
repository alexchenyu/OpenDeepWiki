// 用户个人资料信息组件
import { useState, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast as sonnerToast } from 'sonner'
import {
  Camera,
  Save,
  Edit,
  X,
  Loader2
} from 'lucide-react'
import { userService } from '@/services/userService'
import { getErrorMessage } from '@/lib/errors'

export const ProfileInfo: React.FC = () => {
  const { user, } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // 表单数据
  const [formData, setFormData] = useState({
    username: user?.username || '',
    email: user?.email || '',
    bio: '',
    location: '',
    website: '',
    company: ''
  })

  // 处理表单输入变化
  const handleInputChange = <K extends keyof typeof formData>(
    field: K,
    value: (typeof formData)[K]
  ) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  // 保存用户信息
  const handleSave = async () => {
    setLoading(true)
    try {
      await userService.updateProfile(formData)
      // await refreshUser()
      setIsEditing(false)
      sonnerToast.success('保存成功', { description: '您的个人资料已更新' })
    } catch (error) {
      const message = getErrorMessage(error, '更新个人资料时出错')
      sonnerToast.error('保存失败', { description: message })
    } finally {
      setLoading(false)
    }
  }

  // 取消编辑
  const handleCancel = () => {
    setFormData({
      username: user?.username || '',
      email: user?.email || '',
      bio: '',
      location: '',
      website: '',
      company: ''
    })
    setIsEditing(false)
  }

  // 处理头像上传
  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // 验证文件类型
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!validTypes.includes(file.type)) {
      sonnerToast.error('文件类型错误', { description: '请上传 JPG、PNG、GIF 或 WebP 格式的图片' })
      return
    }

    // 验证文件大小（5MB）
    if (file.size > 5 * 1024 * 1024) {
      sonnerToast.error('文件太大', { description: '图片大小不能超过 5MB' })
      return
    }

    setUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append('avatar', file)

      await userService.uploadAvatar(formData)

      sonnerToast.success('上传成功', { description: '头像已更新' })
    } catch (error) {
      const message = getErrorMessage(error, '上传头像时出错')
      sonnerToast.error('上传失败', { description: message })
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // 删除头像
  const handleDeleteAvatar = async () => {
    try {
      await userService.deleteAvatar()
      setShowDeleteDialog(false)
      sonnerToast.success('删除成功', { description: '头像已删除' })
    } catch (error) {
      const message = getErrorMessage(error, '删除头像时出错')
      sonnerToast.error('删除失败', { description: message })
    }
  }

  return (
    <div className="space-y-6">
      {/* 头像部分 */}
      <div className="flex items-center space-x-6">
        <div className="relative">
          <Avatar className="h-24 w-24">
            <AvatarImage src={user?.avatar} alt={user?.username} />
            <AvatarFallback className="text-2xl">
              {user?.username?.[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>

          {/* 头像操作按钮 */}
          <div className="absolute -bottom-2 -right-2 flex space-x-1">
            <Button
              size="sm"
              variant="secondary"
              className="h-8 w-8 rounded-full p-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
            >
              {uploadingAvatar ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
            </Button>
            {user?.avatar && (
              <Button
                size="sm"
                variant="destructive"
                className="h-8 w-8 rounded-full p-0"
                onClick={() => setShowDeleteDialog(true)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarUpload}
          />
        </div>

        <div className="flex-1">
          <h2 className="text-2xl font-semibold">{user?.username}</h2>
          <p className="text-muted-foreground">{user?.email}</p>
        </div>

        {/* 编辑按钮 */}
        {!isEditing && (
          <Button onClick={() => setIsEditing(true)} variant="outline">
            <Edit className="h-4 w-4 mr-2" />
            编辑资料
          </Button>
        )}
      </div>

      {/* 表单部分 */}
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="username">用户名</Label>
            <Input
              id="username"
              value={formData.username}
              onChange={(e) => handleInputChange('username', e.target.value)}
              disabled={!isEditing}
              placeholder="请输入用户名"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              disabled={!isEditing}
              placeholder="请输入邮箱"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">位置</Label>
            <Input
              id="location"
              value={formData.location}
              onChange={(e) => handleInputChange('location', e.target.value)}
              disabled={!isEditing}
              placeholder="例如: 北京, 中国"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="company">公司</Label>
            <Input
              id="company"
              value={formData.company}
              onChange={(e) => handleInputChange('company', e.target.value)}
              disabled={!isEditing}
              placeholder="您所在的公司"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="website">个人网站</Label>
            <Input
              id="website"
              type="url"
              value={formData.website}
              onChange={(e) => handleInputChange('website', e.target.value)}
              disabled={!isEditing}
              placeholder="https://example.com"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="bio">个人简介</Label>
            <Textarea
              id="bio"
              value={formData.bio}
              onChange={(e) => handleInputChange('bio', e.target.value)}
              disabled={!isEditing}
              placeholder="介绍一下您自己..."
              rows={4}
              className="resize-none"
            />
          </div>
        </div>

        {/* 操作按钮 */}
        {isEditing && (
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={loading}
            >
              <X className="h-4 w-4 mr-2" />
              取消
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  保存更改
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* 删除头像确认对话框 */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除头像</AlertDialogTitle>
            <AlertDialogDescription>
              您确定要删除当前头像吗？删除后将使用默认头像。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAvatar}>
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
