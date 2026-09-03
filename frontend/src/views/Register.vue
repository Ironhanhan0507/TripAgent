<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Compass } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { getErrorMessage } from '@/api/client'

const router = useRouter()
const auth = useAuthStore()

const formRef = ref<FormInstance>()
const loading = ref(false)
const form = reactive({ email: '', password: '', confirm: '', name: '' })

const rules: FormRules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 8, message: '密码至少 8 位', trigger: 'blur' },
  ],
  confirm: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (_r, v, cb) => (v === form.password ? cb() : cb(new Error('两次输入的密码不一致'))),
      trigger: 'blur',
    },
  ],
}

async function submit() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    await auth.register(form.email, form.password, form.name || undefined)
    ElMessage.success('注册成功，欢迎使用 TripAgent')
    router.push('/chat')
  } catch (e) {
    ElMessage.error(getErrorMessage(e))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-full items-center justify-center bg-gradient-to-br from-brand-50 via-white to-sun-50 px-4 py-12">
    <div class="w-full max-w-md">
      <div class="rounded-3xl border border-slate-100 bg-white p-8 shadow-xl shadow-brand-900/5">
        <div class="flex flex-col items-center">
          <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md">
            <el-icon :size="26"><Compass /></el-icon>
          </div>
          <h1 class="mt-4 text-2xl font-bold tracking-tight text-slate-900">创建账号</h1>
          <p class="mt-1 text-sm text-slate-400">开始你的第一次 AI 旅行规划</p>
        </div>

        <el-form ref="formRef" :model="form" :rules="rules" size="large" class="mt-8" @submit.prevent>
          <el-form-item prop="email">
            <el-input v-model="form.email" placeholder="邮箱" autocomplete="email" />
          </el-form-item>
          <el-form-item prop="name">
            <el-input v-model="form.name" placeholder="昵称（可选）" />
          </el-form-item>
          <el-form-item prop="password">
            <el-input v-model="form.password" type="password" placeholder="密码（至少 8 位）" show-password autocomplete="new-password" />
          </el-form-item>
          <el-form-item prop="confirm">
            <el-input v-model="form.confirm" type="password" placeholder="确认密码" show-password autocomplete="new-password" @keyup.enter="submit" />
          </el-form-item>
          <el-button type="primary" size="large" class="!w-full" :loading="loading" @click="submit">
            注册
          </el-button>
        </el-form>

        <div class="mt-6 text-center text-sm text-slate-400">
          已有账号？
          <router-link to="/login" class="font-medium text-brand-600 hover:text-brand-700">直接登录</router-link>
        </div>
      </div>
      <div class="mt-4 text-center text-xs text-slate-300">TripAgent · AI 智能旅行规划</div>
    </div>
  </div>
</template>
