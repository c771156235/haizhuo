/**
 * 路由配置
 */
import { Routes, Route, Navigate } from 'react-router-dom'
import { Spin } from 'antd'
import { useAuth } from '../contexts/AuthContext'
import ProtectedRoute from '../components/ProtectedRoute'
import ManagerRoute from '../components/ManagerRoute'
import Login from '../pages/Login'
import Register from '../pages/Register'
import Layout from '../layouts/Layout'
import Dashboard from '../pages/Dashboard'
import TaskList from '../pages/TaskList'
import TaskDetail from '../pages/TaskDetail'
import WorkOrderList from '../pages/WorkOrderList'
import WorkOrderDetail from '../pages/WorkOrderDetail'
import VisitLogList from '../pages/VisitLogList'
import VisitLogDetail from '../pages/VisitLogDetail'
import VisitLogCreate from '../pages/VisitLogCreate'
import VisitLogEdit from '../pages/VisitLogEdit'
import ReviewList from '../pages/ReviewList'
import ReviewDetail from '../pages/ReviewDetail'
import ReviewCreate from '../pages/ReviewCreate'
import ReviewEdit from '../pages/ReviewEdit'
import OpportunityList from '../pages/OpportunityList'
import OpportunityDetail from '../pages/OpportunityDetail'
import OpportunityCreate from '../pages/OpportunityCreate'
import OpportunityEdit from '../pages/OpportunityEdit'
import UserList from '../pages/UserList'
import AuditLogList from '../pages/AuditLogList'
import UserCreate from '../pages/UserCreate'
import UserEdit from '../pages/UserEdit'
import GroupList from '../pages/GroupList'
import Profile from '../pages/Profile'
import NotificationList from '../pages/NotificationList'
import Statistics from '../pages/Statistics'
import TodoList from '../pages/TodoList'
import OptionConfigList from '../pages/OptionConfigList'

const AppRouter = () => {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={isAuthenticated ? <Navigate to="/" replace /> : <Register />} />
      
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="statistics" element={<Statistics />} />
        <Route path="tasks" element={<TaskList />} />
        <Route path="tasks/:id" element={<TaskDetail />} />
        <Route path="work-orders" element={<WorkOrderList />} />
        <Route path="work-orders/:id" element={<WorkOrderDetail />} />
        <Route path="visit-logs" element={<VisitLogList />} />
        <Route path="visit-logs/create" element={<VisitLogCreate />} />
        <Route path="visit-logs/:id" element={<VisitLogDetail />} />
        <Route path="visit-logs/:id/edit" element={<VisitLogEdit />} />
        <Route path="reviews" element={<ReviewList />} />
        <Route path="reviews/create" element={<ReviewCreate />} />
        <Route path="reviews/:id" element={<ReviewDetail />} />
        <Route path="reviews/:id/edit" element={<ReviewEdit />} />
        <Route path="opportunities" element={<OpportunityList />} />
        <Route path="opportunities/create" element={<OpportunityCreate />} />
        <Route path="opportunities/:id" element={<OpportunityDetail />} />
        <Route path="opportunities/:id/edit" element={<OpportunityEdit />} />
        <Route
          path="users"
          element={
            <ManagerRoute>
              <UserList />
            </ManagerRoute>
          }
        />
        <Route
          path="users/create"
          element={
            <ManagerRoute>
              <UserCreate />
            </ManagerRoute>
          }
        />
        <Route
          path="users/:id/edit"
          element={
            <ManagerRoute>
              <UserEdit />
            </ManagerRoute>
          }
        />
        <Route
          path="groups"
          element={
            <ManagerRoute>
              <GroupList />
            </ManagerRoute>
          }
        />
        <Route path="profile" element={<Profile />} />
        <Route path="notifications" element={<NotificationList />} />
        <Route path="todos" element={<TodoList />} />
        <Route
          path="audit-logs"
          element={
            <ManagerRoute>
              <AuditLogList />
            </ManagerRoute>
          }
        />
        <Route
          path="option-configs"
          element={
            <ManagerRoute>
              <OptionConfigList />
            </ManagerRoute>
          }
        />
      </Route>
      
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default AppRouter

