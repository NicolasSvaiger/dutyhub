# Implementation Plan: Doctors Screen Migration

## Overview

Migrar a tela estática `frontend/public/medico.html` para componentes React dentro da SPA, criando uma rota `/doctor` com sub-telas internas gerenciadas por estado local, CSS Module isolado, integração com hooks existentes e testes de propriedade com fast-check.

## Tasks

- [x] 1. Set up types, CSS Module, and icon components
  - [x] 1.1 Create `frontend/src/pages/doctor/types.ts` with `DoctorScreen`, `ConfirmationData`, `ReportFilters`, and `ReportStats` types
    - Define `DoctorScreen` as a union type: `'home' | 'checkin-confirm' | 'checkout-confirm' | 'reports'`
    - Define `ConfirmationData` interface with `type`, `dateTime`, and `clinicName`
    - Define `ReportFilters` interface with `startDate`, `endDate`, and `clinicId`
    - Define `ReportStats` interface with `totalShifts`, `totalHours`, and `avgHoursPerShift`
    - _Requirements: 1.1, 2.2, 3.2, 4.2_

  - [x] 1.2 Create `frontend/src/pages/doctor/DoctorPage.module.css` extracting all CSS from `medico.html`
    - Extract all CSS rules from the `<style>` block in `medico.html`
    - Convert class names to CSS Module format (camelCase where appropriate)
    - Preserve all CSS variables (--teal, --orange, --bg, --text, --muted, --nav-h)
    - Preserve all animations: fadeUp, pulse-oval, scanning, fill-up, blink, float-user, scan-ring, pop, slideUp, fadeIn
    - Preserve font-family Nunito import reference
    - _Requirements: 6.1, 6.2, 6.3, 6.5_

  - [x] 1.3 Create `frontend/src/pages/doctor/icons.tsx` with all SVG icon components
    - Extract Logo24p7 SVG component (gradient heart + heartbeat line)
    - Extract NavHome, NavCheckIn, NavCheckOut, NavReports, NavLogout icon components
    - Extract CheckmarkIcon, LogoutArrowIcon, UserAvatarIcon components
    - All SVGs must be identical to those in `medico.html`
    - _Requirements: 6.4, 5.1_

- [x] 2. Implement utility hooks
  - [x] 2.1 Create `frontend/src/pages/doctor/useClock.ts` hook
    - Return formatted time as "HH:mm" string, updated every second via `setInterval`
    - Clean up interval on unmount
    - Export a pure `formatTime(date: Date): string` function for testability
    - _Requirements: 1.5_

  - [x] 2.2 Write property test for `formatTime` (Property 2: Clock time formatting)
    - **Property 2: Clock time formatting**
    - For any valid Date, `formatTime` must return a string matching `/^\d{2}:\d{2}$/`
    - Hours must be in [00, 23], minutes in [00, 59]
    - **Validates: Requirements 1.5**

  - [x] 2.3 Create `frontend/src/pages/doctor/useReportStats.ts` hook
    - Accept an array of `Attendance` records
    - Compute `totalShifts` (count of records with checkOutTime)
    - Compute `totalHours` (sum of durations in hours)
    - Compute `avgHoursPerShift` (totalHours / totalShifts, or 0 if empty)
    - Return a memoized `ReportStats` object
    - _Requirements: 4.2_

  - [x] 2.4 Write property test for `useReportStats` (Property 6: Report statistics computation)
    - **Property 6: Report statistics computation**
    - For any list of records with valid checkIn/checkOut times: totalShifts == records.length, totalHours == sum of durations, avg == totalHours / totalShifts (or 0)
    - **Validates: Requirements 4.2**

- [x] 3. Implement DoctorBottomNav and LogoutModal components
  - [x] 3.1 Create `frontend/src/pages/doctor/DoctorBottomNav.tsx`
    - Render 5 nav buttons: Início, Check-in, Check-out, Relatórios, Sair
    - Accept `activeScreen` and `onNavigate` and `onLogout` props
    - Highlight active tab with teal (or orange for check-out) color
    - Use SVG icons from `icons.tsx`
    - Fixed positioning at bottom with `var(--nav-h)` height and safe-area-inset-bottom
    - _Requirements: 5.1, 5.2, 5.3, 5.5_

  - [x] 3.2 Create `frontend/src/pages/doctor/LogoutModal.tsx`
    - Render bottom-sheet modal overlay with slideUp animation
    - Show confirmation message "Deseja realmente sair?"
    - Accept `onConfirm` and `onCancel` props
    - Use `.modal-overlay.open` pattern from original CSS
    - _Requirements: 5.4_

- [x] 4. Implement DoctorHomeScreen
  - [x] 4.1 Create `frontend/src/pages/doctor/DoctorHomeScreen.tsx`
    - Display page header with gradient background, logo, greeting with doctor's name from `useAuth`, and live clock from `useClock`
    - Display panel surface with "Selecione a opção desejada" label
    - Render "Check-in" button (btn-teal) and "Check-out" button (btn-orange)
    - Handle check-in: get geolocation, POST to `/attendance/check-in`, on success call `onCheckedIn` with confirmation data
    - Handle check-out: get geolocation, POST to `/attendance/check-out`, on success call `onCheckedOut` with confirmation data
    - Handle offline: enqueue via `useOfflineSync` when network fails
    - Disable buttons and show loading state during API calls
    - Show error messages on failure
    - Show PendingOperationsIndicator when offline events exist
    - _Requirements: 1.4, 1.5, 2.1, 2.3, 2.4, 3.1, 3.3, 3.4, 7.1, 7.2, 7.4_

  - [x] 4.2 Write property test for attendance payload (Property 4: Attendance API payload correctness)
    - **Property 4: Attendance API payload correctness**
    - For any valid lat in [-90,90], lng in [-180,180], the constructed payload must contain those exact coordinates and a non-empty deviceId
    - **Validates: Requirements 2.1, 3.1**

  - [x] 4.3 Write property test for user name display (Property 3: User name display)
    - **Property 3: User name display**
    - For any non-empty user name, the rendered home screen greeting must contain that name
    - **Validates: Requirements 1.4**

  - [x] 4.4 Write property test for offline queue preservation (Property 10: Offline queue preservation)
    - **Property 10: Offline queue preservation**
    - For any attendance event that fails due to network error, the queued event must preserve shiftId, coordinates, userId, clinicId, and attendanceType
    - **Validates: Requirements 7.1, 7.2**

  - [x] 4.5 Write property test for pending indicator visibility (Property 11: Pending indicator visibility)
    - **Property 11: Pending indicator visibility**
    - For any non-empty list of events with status Pending/Failed, the pending indicator must be visible
    - **Validates: Requirements 7.4**

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Confirmation Screens
  - [x] 6.1 Create `frontend/src/pages/doctor/DoctorCheckInConfirmScreen.tsx`
    - Display page header with "Check-In" title and subtitle
    - Show confirmation icon (teal gradient circle with checkmark)
    - Show "Check-In realizado!" title
    - Render person-card with doctor name, CRM, date, time, location, and status
    - Accept `ConfirmationData` prop for dynamic content
    - _Requirements: 2.2, 6.6_

  - [x] 6.2 Create `frontend/src/pages/doctor/DoctorCheckOutConfirmScreen.tsx`
    - Display page header with "Check-Out" title and subtitle
    - Show confirmation icon (orange gradient circle with logout arrow)
    - Show "Check-Out realizado!" title
    - Render person-card with doctor name, CRM, date, time, location, and status (orange variant)
    - Accept `ConfirmationData` prop for dynamic content
    - _Requirements: 3.2, 6.6_

  - [x] 6.3 Write property test for confirmation data completeness (Property 5: Confirmation screen data completeness)
    - **Property 5: Confirmation screen data completeness**
    - For any valid timestamp and clinic name, the confirmation screen must render doctor name, formatted date, formatted time, and clinic name
    - **Validates: Requirements 2.2, 3.2**

- [x] 7. Implement DoctorReportsScreen
  - [x] 7.1 Create `frontend/src/pages/doctor/DoctorReportsScreen.tsx`
    - Display page header with gradient and "Relatórios" title
    - Fetch attendance history from `GET /attendance/my-history`
    - Render stats card with grid (totalShifts, totalHours, avgHoursPerShift) using `useReportStats`
    - Render filter card with date range inputs, clinic select, and "Buscar" button
    - Filter records by date range and clinic locally
    - Render record list with items showing date, time, and badge (badge-in/badge-out)
    - Show loading indicator while fetching data
    - Show error message with retry on fetch failure
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 6.7_

  - [x] 7.2 Write property test for date range filtering (Property 7: Date range filtering)
    - **Property 7: Date range filtering**
    - For any date range and list of records, filtered result must only contain records with checkInTime in [startDate, endDate]
    - **Validates: Requirements 4.3**

  - [x] 7.3 Write property test for unit filtering (Property 8: Unit filtering)
    - **Property 8: Unit filtering**
    - For any clinicId and list of records, filtered result must only contain records with matching clinicId
    - **Validates: Requirements 4.4**

  - [x] 7.4 Write property test for record rendering (Property 9: Record rendering completeness)
    - **Property 9: Record rendering completeness**
    - For any record with checkInTime and clinicId, rendered output must contain formatted date, check-in time, and a type badge
    - **Validates: Requirements 4.5**

- [x] 8. Implement DoctorPage and wire route
  - [x] 8.1 Create `frontend/src/pages/doctor/index.ts` barrel export
    - Export `DoctorPage` as the default page component from the doctor folder
    - _Requirements: 1.1_

  - [x] 8.2 Create `frontend/src/pages/DoctorPage.tsx` as the root page component
    - Manage `screen` state (`DoctorScreen` type) with initial value `'home'`
    - Manage `confirmData` state (`ConfirmationData | null`)
    - Manage `showLogoutModal` state
    - Render active screen conditionally with fadeUp animation class
    - Render `DoctorBottomNav` with screen navigation and logout handler
    - Render `LogoutModal` when open, calling `logout()` from `useAuth` and navigating to `/login` on confirm
    - _Requirements: 1.1, 5.2, 5.4, 5.6_

  - [x] 8.3 Register DoctorPage in `frontend/src/pages/index.ts`
    - Add export for `DoctorPage` from `'./DoctorPage'`
    - _Requirements: 1.1_

  - [x] 8.4 Add `/doctor` route in `frontend/src/App.tsx`
    - Import `DoctorPage` in the pages import
    - Add `<Route path="/doctor" element={<ProtectedRoute requiredRoles={['Medico']}><DoctorPage /></ProtectedRoute>} />`
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 8.5 Add "Médico" navigation link in `AppLayout` for users with role "Medico"
    - Add conditional link `<Link to="/doctor">Médico</Link>` alongside existing nav links
    - Show only when user roles include "Medico"
    - _Requirements: 5.2_

  - [x] 8.6 Write property test for route access control (Property 1: Route access control)
    - **Property 1: Route access control**
    - For any user roles array, access to /doctor is granted iff roles contains "Medico"
    - **Validates: Requirements 1.1, 1.2**

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using fast-check
- Unit tests validate specific examples and edge cases
- All property tests should be placed in `frontend/src/pages/doctor/__tests__/doctor.property.test.ts`
- The CSS Module approach isolates medico.html styles from the rest of the app
- Existing hooks (useAuth, useOfflineSync, useGeolocation, useNetworkStatus, useClinic) are used without modification
