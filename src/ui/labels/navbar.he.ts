// Accessible names in the app navbar. The management menus render only for roles that can
// access company management (admin, operator); an employee sees only "my attendance".
export const navbarLabels = {
  mainNavigation: 'ניווט ראשי',
  menu: {
    company: 'חברה',
    users: 'משתמשים',
    attendanceManagement: 'ניהול נוכחות',
    myAttendance: 'הנוכחות שלי',
    preferences: 'העדפות'
  },
  logout: 'יציאה',
  customerLogin: 'כניסת לקוחות'
} as const

export type NavbarMenu = keyof typeof navbarLabels.menu
