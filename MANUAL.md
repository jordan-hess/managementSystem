# Care CMS — User Instruction Manual

> **Role indicators:** 🔵 All users · 🟠 Admin only · 🟢 Agent only

---

## Table of Contents

1. [Logging In & Out](#1-logging-in--out)
2. [Dashboard](#2-dashboard)
3. [Customers](#3-customers)
4. [Callbacks](#4-callbacks)
5. [Follow-ups](#5-follow-ups)
6. [Escalations](#6-escalations)
7. [Notifications](#7-notifications)
8. [Managing Agents](#8-managing-agents) *(Admin)*
9. [Team Roster](#9-team-roster)
10. [Leave & Overtime Requests](#10-leave--overtime-requests)

---

## 1. Logging In & Out

### Log in
1. Navigate to the app URL.
2. Enter your email address and password.
3. Click **Sign In**.

### Log out
1. Click your avatar or name in the bottom-left of the sidebar.
2. Click **Sign Out**.

---

## 2. Dashboard

### Navigate to a section from the dashboard
- Click any stat card (Pending Callbacks, Open Follow-ups, etc.) to go directly to that section.

### View an upcoming callback
- Upcoming pending callbacks are listed under **Upcoming Callbacks**.
- Each row shows the customer name, phone number, description, and how long until the call.
- Click **View all** to open the full Callbacks page.

### View open follow-ups
- Open follow-ups appear under **Open Follow-ups** with priority badges.
- Click **View all** to open the Follow-ups page.

---

## 3. Customers

### Add a customer 🔵
1. Go to **Customers** in the sidebar.
2. Click **Add Customer**.
3. Fill in **Full Name** and **Phone Number** (required).
4. Optionally add Email, Account Number, and Notes.
5. Click **Add Customer**.

### Search for a customer 🔵
1. Go to **Customers**.
2. Type a name, phone number, or email in the search bar.
3. Results filter in real time.

### Edit a customer 🔵
1. Find the customer in the list.
2. Click the **pencil icon** on their row.
3. Update the fields and click **Save Changes**.

### Delete a customer 🟠
1. Find the customer in the list.
2. Click the **trash icon** on their row.
3. Confirm the deletion in the prompt.

> Deleting a customer also removes all their callbacks and follow-ups.

---

## 4. Callbacks

### Schedule a callback for yourself 🟢
1. Go to **Callbacks** in the sidebar.
2. Click **Schedule Callback**.
3. Select a **Customer**, set the **Date & Time**, and enter a **Query Description**.
4. Optionally add a Possible Solution and Notes.
5. Click **Schedule**.

### Assign a callback to an agent 🟠
1. Go to **Callbacks**.
2. Click **Schedule Callback**.
3. Select the **Agent** to assign the callback to.
4. Select a **Customer**, set the **Date & Time**, and enter a **Query Description**.
5. Click **Schedule**.
> The assigned agent receives an immediate notification and a reminder 5 minutes before the scheduled time.

### Filter callbacks by status 🔵
1. Go to **Callbacks**.
2. Click one of the filter tabs: **All · Pending · Completed · Cancelled · Rescheduled**.

### Mark a callback as complete 🔵
- On any **Pending** callback, click **Mark complete**.

### Reschedule a callback 🔵
1. On any **Pending** callback, click **Reschedule**.  
   *(This sets the status to Rescheduled — the 5-minute reminder will reset when you update the time.)*
2. To set a new time, click **Edit** on the same callback, update **Scheduled Date & Time**, and save.

### Edit a callback 🔵
1. Click **Edit** on the callback row.
2. Update any fields (including Status when editing).
3. Click **Save Changes**.

---

## 5. Follow-ups

### Create a follow-up 🔵
1. Go to **Follow-ups & Escalations** in the sidebar.
2. Click **Add Follow-up**.
3. Select a **Customer** and **Assigned Agent**.
4. Enter an **Issue Description**, set **Priority** and optional **Due Date**.
5. Click **Save**.

### Update a follow-up's status 🔵
1. Find the follow-up in the list.
2. Click **Edit** (pencil icon).
3. Change the **Status** field (Open → In Progress → Resolved → Closed).
4. Click **Save Changes**.

### Filter follow-ups 🔵
- Use the filter tabs at the top: **All · Open · In Progress · Resolved · Closed**.

### Add resolution notes 🔵
1. Click **Edit** on a follow-up.
2. Fill in the **Resolution Notes** field.
3. Set Status to **Resolved** and click **Save Changes**.

---

## 6. Escalations

### Send an escalation to an agent 🟠
1. Go to **Admin → Escalations** in the sidebar.
2. Click **Send Escalation**.
3. Select the **Agent** to assign and the **Customer** involved.
4. Enter the **Issue Description** and optionally a **Suggested Solution**.
5. Set **Priority** and an optional **Due Date**.
6. Click **Send Escalation**.
> The assigned agent receives a notification immediately and can see the escalation under Follow-ups & Escalations.

### View all escalations 🟠
1. Go to **Admin → Escalations**.
2. The list shows every escalation with customer, assigned agent, priority, and status.

---

## 7. Notifications

### Open the notification panel 🔵
- Click the **bell icon** in the top-right header on any page.
- Unread notifications show a red count badge.

### Go to the relevant page from a notification 🔵
- Click any notification that has a **→ View** link. You will be taken directly to:
  - **Callback / Reminder** → Callbacks page
  - **Escalation / Follow-up** → Follow-ups page
  - **Request** → Admin Requests (admin) or Roster (agent)

### Mark a single notification as read 🔵
- Click any unread notification. It is marked read automatically.

### Mark all notifications as read 🔵
- Open the notification panel and click **Mark all read**.

---

## 8. Managing Agents

> All actions in this section are admin-only.

### Create a new agent or admin account 🟠
1. Go to **Admin → Manage Agents**.
2. Click **Add Agent**.
3. Enter **Full Name**, **Email**, **Password**, **Role** (Agent or Admin), and optional Department.
4. Click **Create**.

### Deactivate an agent 🟠
1. Go to **Admin → Manage Agents**.
2. Find the agent and click the **deactivate** toggle or button on their row.
> Deactivated agents cannot log in and do not appear in assignment dropdowns.

### Promote an agent to admin 🟠
1. Go to **Admin → Manage Agents**.
2. Click **Edit** on the agent's row.
3. Change their **Role** to **Admin** and save.

### Assign an agent to a team 🟠
1. Go to **Admin → Manage Agents**.
2. Click **Edit** on the agent's row.
3. Select the **Team** from the dropdown and save.

### Create a new team 🟠
1. Go to **Admin → Manage Agents**.
2. Click **Manage Teams**.
3. Click **Add Team**, enter a name and colour, then save.

### Assign a team leader 🟠
1. Go to **Admin → Manage Agents**.
2. Find the agent to promote to team leader.
3. Click **Set as Team Leader** on their row and confirm.

---

## 9. Team Roster

### Switch calendar view 🔵
1. Go to **Roster** in the sidebar.
2. Click **Month**, **Week**, or **Day** at the top right of the calendar.

### Navigate between dates 🔵
- Click the **← →** arrows to move backward or forward.
- Click **Today** to return to the current date.

### Mark attendance for an agent 🟠
1. Go to **Roster**.
2. Find the agent's row on the selected date.
3. Click the attendance cell and select a status: **On Shift · Late · Absent · Sick · Leave · Off**.

### Assign a rotation (weekly shift schedule) to a team 🟠
1. Go to **Roster**.
2. Click **Manage Rotations**.
3. Select the **Team**, **Shift Template**, and **Week Start Date**.
4. Click **Save Rotation**.

### Create a shift template 🟠
1. Go to **Roster**.
2. Click **Shift Templates**.
3. Click **Add Template**.
4. Enter a name, start time, end time, and select the working days.
5. Click **Save**.

### Add a roster override for one agent on one day 🟠
1. Go to **Roster**.
2. Click on the specific agent's cell for the date to override.
3. Select the override type: **Day Off · Swap In · Extra Shift**.
4. Optionally assign a different shift template.
5. Save the override.

---

## 10. Leave & Overtime Requests

### Submit a leave request 🟢
1. Go to **Roster**.
2. Click **My Requests**, then **New Request → Leave**.
3. Select the **Leave Type** (Annual, Sick, Family Responsibility, Unpaid, Other).
4. Pick the date(s) on the calendar.
5. Add optional notes and click **Submit**.

### Submit an overtime request 🟢
1. Go to **Roster**.
2. Click **My Requests**, then **New Request → Overtime**.
3. Select the **Month** and **Year**.
4. Click **Add Entry** for each overtime day.
5. For each entry set: Date, Shift type, OT 1.5× hours, OT 2.0× hours, Night hours.
6. Add optional notes and click **Submit**.

### Check the status of a request 🟢
1. Go to **Roster → My Requests**.
2. Each request shows its current status: **Draft · Pending · Approved · Rejected · Changes Requested**.

### Review and approve or reject a request 🟠
1. Go to **Admin → Requests**.
2. Use the filters (type, status, team) or the search bar to find the request.
3. Click on the request to open the detail drawer.
4. Click **Approve** or **Reject**, add an optional comment, and confirm.

### Request changes on a submitted request 🟠
1. Open the request detail drawer (see above).
2. Click **Request Changes**.
3. Add a comment explaining what needs to be updated and confirm.
> The agent is notified and can resubmit after making changes.

---

*For technical setup and schema instructions, refer to `CLAUDE.md`.*
