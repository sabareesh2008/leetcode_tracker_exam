let supabaseClient = null;
let currentUser = null;
let currentRole = null;

let allStudents = [];
let visibleStudents = [];
let directoryStudents = [];

let historyRows = [];
let dailyActivityRows = [];
let profileDataLoaded = false;

let codingTests = [];
let codingAttempts = [];
let codingAnalyticsLoaded = false;

let selectedSection = null;
let pendingDeleteId = null;

const cfg = window.APP_CONFIG || {};

const sectionHome = document.getElementById("sectionHome");
const leaderboardView = document.getElementById("leaderboardView");
const backToSectionsButton = document.getElementById("backToSectionsButton");

const currentViewLabel = document.getElementById("currentViewLabel");
const currentViewTitle = document.getElementById("currentViewTitle");
const printTitle = document.getElementById("printTitle");
const rankLegendText = document.getElementById("rankLegendText");

const tableBody = document.getElementById("studentTableBody");
const messageElement = document.getElementById("message");
const searchInput = document.getElementById("searchInput");

const adminLoginButton = document.getElementById("adminLoginButton");
const adminLogoutButton = document.getElementById("adminLogoutButton");
const homeAdminLogoutButton = document.getElementById("homeAdminLogoutButton");
const adminSessionCard = document.getElementById("adminSessionCard");
const sessionEmail = document.getElementById("sessionEmail");
const accessNote = document.getElementById("accessNote");

const adminLoginModal = document.getElementById("adminLoginModal");
const adminLoginForm = document.getElementById("adminLoginForm");
const adminEmail = document.getElementById("adminEmail");
const adminPassword = document.getElementById("adminPassword");
const adminSignInButton = document.getElementById("adminSignInButton");
const adminLoginMessage = document.getElementById("adminLoginMessage");
const closeAdminLogin = document.getElementById("closeAdminLogin");
const toggleAdminPassword = document.getElementById("toggleAdminPassword");

const addProfileButton = document.getElementById("addProfileButton");
const syncNowButton = document.getElementById("syncNowButton");
const manageStudentsButton = document.getElementById("manageStudentsButton");

const homeAddProfileButton = document.getElementById("homeAddProfileButton");
const homeSyncNowButton = document.getElementById("homeSyncNowButton");
const homeManageStudentsButton = document.getElementById("homeManageStudentsButton");
const homeFacultyAnalyticsButton = document.getElementById("homeFacultyAnalyticsButton");
const facultyAnalyticsButton = document.getElementById("facultyAnalyticsButton");

const profileModal = document.getElementById("profileModal");
const profileForm = document.getElementById("profileForm");
const closeProfileModal = document.getElementById("closeProfileModal");
const editingStudentId = document.getElementById("editingStudentId");
const registerNumberInput = document.getElementById("registerNumber");
const studentNameInput = document.getElementById("studentName");
const usernameInput = document.getElementById("leetcodeUsername");
const studentSectionInput = document.getElementById("studentSection");
const generatedLink = document.getElementById("generatedLink");
const formMessage = document.getElementById("formMessage");
const saveProfileButton = document.getElementById("saveProfileButton");

const manageStudentsModal = document.getElementById("manageStudentsModal");
const closeManageStudents = document.getElementById("closeManageStudents");
const manageStudentsBody = document.getElementById("manageStudentsBody");
const manageSearch = document.getElementById("manageSearch");
const manageCount = document.getElementById("manageCount");
const manageSectionFilter = document.getElementById("manageSectionFilter");

const deleteModal = document.getElementById("deleteModal");
const deleteDescription = document.getElementById("deleteDescription");
const deleteMessage = document.getElementById("deleteMessage");
const cancelDeleteButton = document.getElementById("cancelDeleteButton");
const confirmDeleteButton = document.getElementById("confirmDeleteButton");

const SECTION_NAMES = [
  "ECE A",
  "ECE B",
  "ECE C",
  "ECE D",
  "ECE E",
  "ECE F"
];

const exportColumns = [
  "Overall Rank",
  "Section Rank",
  "Section",
  "Register Number",
  "Student Name",
  "LeetCode Username",
  "LeetCode Link",
  "Problems Solved",
  "Solved Today",
  "Last 7 Days",
  "Last 30 Days",
  "Easy",
  "Medium",
  "Hard",
  "Status"
];


function configured() {
  return Boolean(
    cfg.SUPABASE_URL
    && cfg.SUPABASE_ANON_KEY
    && !cfg.SUPABASE_URL.startsWith("PASTE_")
    && !cfg.SUPABASE_ANON_KEY.startsWith("PASTE_")
  );
}


function createClient() {
  if (!configured()) {
    throw new Error(
      "Supabase is not configured. Put your Project URL and publishable key in config.js."
    );
  }

  supabaseClient = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY
  );
}


function isAdmin() {
  return currentRole === "admin";
}


function updateAdminUI() {
  document.querySelectorAll(".admin-only").forEach((element) => {
    element.hidden = !isAdmin();
  });

  adminLoginButton.hidden = isAdmin();
  adminSessionCard.hidden = !isAdmin();

  if (isAdmin()) {
    sessionEmail.textContent = currentUser?.email || "Administrator";
    accessNote.textContent =
      "Admin Mode · Add, Sync and Manage Students enabled.";
  } else {
    accessNote.textContent =
      "Public view · No login required";
  }
}


function parseCSV(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }

      row.push(value);

      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }

      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (value !== "" || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map(
    (header) => header.replace(/^\uFEFF/, "").trim()
  );

  return rows.slice(1).map((cells) =>
    Object.fromEntries(
      headers.map((header, index) => [
        header,
        (cells[index] ?? "").trim()
      ])
    )
  );
}




function normalizeSection(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function rankClass(rank) {
  const value = Number(rank);

  if (value === 1) return "rank-1";
  if (value === 2) return "rank-2";
  if (value === 3) return "rank-3";

  return "";
}




function calculateSectionChampionship() {
  const results = SECTION_NAMES.map((section) => {
    const students = allStudents.filter(
      (student) =>
        String(student.Section || "").trim().toUpperCase()
        === section.toUpperCase()
    );

    const last30 = students.reduce(
      (sum, student) =>
        sum + toNumber(student["Last 30 Days"]),
      0
    );

    const last7 = students.reduce(
      (sum, student) =>
        sum + toNumber(student["Last 7 Days"]),
      0
    );

    const activeStudents = students.filter(
      (student) =>
        toNumber(student["Last 30 Days"]) > 0
    ).length;

    const average =
      students.length > 0
        ? last30 / students.length
        : 0;

    return {
      section,
      studentCount: students.length,
      last30,
      last7,
      activeStudents,
      average
    };
  });

  return results.sort((a, b) => {
    return (
      b.last30 - a.last30
      || b.last7 - a.last7
      || b.activeStudents - a.activeStudents
      || b.average - a.average
      || a.section.localeCompare(b.section)
    );
  });
}

function championshipRankLabel(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

function renderSectionChampionship() {
  const ranking = calculateSectionChampionship();

  const championBox = document.getElementById(
    "championshipChampion"
  );

  const hasAnyStudents = ranking.some(
    (item) => item.studentCount > 0
  );

  if (!hasAnyStudents) {
    championBox.innerHTML = `
      <span>Current Champion</span>
      <strong>No section data yet</strong>
    `;
  } else {
    const champion = ranking[0];

    championBox.innerHTML = `
      <span>Current Champion</span>
      <strong>🏆 ${escapeHTML(champion.section)}</strong>
      <small>${champion.last30} problems in 30 days</small>
    `;
  }

  const rankGrid = document.getElementById(
    "championshipRankGrid"
  );

  rankGrid.innerHTML = ranking.map((item, index) => {
    const rank = index + 1;

    return `
      <button
        type="button"
        class="championship-section-rank-card rank-card-${rank}"
        data-championship-section="${escapeHTML(item.section)}"
      >
        <div class="championship-rank-top">
          <span class="championship-rank-number">
            ${championshipRankLabel(rank)}
          </span>

          <span class="championship-section-name">
            ${escapeHTML(item.section)}
          </span>
        </div>

        <div class="championship-rank-metrics">
          <div>
            <span>30 Days</span>
            <strong>${item.last30}</strong>
          </div>

          <div>
            <span>7 Days</span>
            <strong>${item.last7}</strong>
          </div>

          <div>
            <span>Active</span>
            <strong>${item.activeStudents}</strong>
          </div>

          <div>
            <span>Students</span>
            <strong>${item.studentCount}</strong>
          </div>
        </div>

        <div class="championship-rank-average">
          Avg / Student:
          <strong>${item.average.toFixed(1)}</strong>
        </div>
      </button>
    `;
  }).join("");
}


function updateCurrentChampionBadge() {
  const sectionRanking = SECTION_NAMES.map((section) => {
    const students = allStudents.filter(
      (student) =>
        normalizeSection(student.Section) === normalizeSection(section)
    );

    const last30 = students.reduce(
      (sum, student) =>
        sum + toNumber(student["Last 30 Days"]),
      0
    );

    const last7 = students.reduce(
      (sum, student) =>
        sum + toNumber(student["Last 7 Days"]),
      0
    );

    const active = students.filter(
      (student) =>
        toNumber(student["Last 30 Days"]) > 0
    ).length;

    const average =
      students.length > 0
        ? last30 / students.length
        : 0;

    return {
      section,
      students: students.length,
      last30,
      last7,
      active,
      average
    };
  }).sort((a, b) =>
    b.last30 - a.last30
    || b.last7 - a.last7
    || b.active - a.active
    || b.average - a.average
    || a.section.localeCompare(b.section)
  );

  const champion = sectionRanking.find(
    (item) => item.students > 0
  );

  const sectionElement =
    document.getElementById("currentChampionSection");

  const scoreElement =
    document.getElementById("currentChampionScore");

  if (!sectionElement || !scoreElement) {
    return;
  }

  if (!champion) {
    sectionElement.textContent = "No data";
    scoreElement.textContent = "Waiting for student activity";
    return;
  }

  sectionElement.textContent = champion.section;
  scoreElement.textContent =
    `${champion.last30} problems in last 30 days`;
}

function updateSectionCounts() {
  const counts = {
    "ECE A": 0,
    "ECE B": 0,
    "ECE C": 0,
    "ECE D": 0,
    "ECE E": 0,
    "ECE F": 0
  };

  allStudents.forEach((student) => {
    if (counts[student.Section] !== undefined) {
      counts[student.Section] += 1;
    }
  });

  document.getElementById("countECEA").textContent = counts["ECE A"];
  document.getElementById("countECEB").textContent = counts["ECE B"];
  document.getElementById("countECEC").textContent = counts["ECE C"];
  document.getElementById("countECED").textContent = counts["ECE D"];
  document.getElementById("countECEE").textContent = counts["ECE E"];
  document.getElementById("countECEF").textContent = counts["ECE F"];
  document.getElementById("countOverall").textContent = allStudents.length;



  updateCurrentChampionBadge();
}


function updateLastUpdated() {
  const updatedAt =
    allStudents.map((student) => student["Updated At"]).find(Boolean)
    || "Waiting for tracker";

  document.getElementById("lastUpdated").textContent = updatedAt;
  document.getElementById("printUpdatedAt").textContent =
    `Last updated: ${updatedAt}`;
}


function getCurrentViewStudents() {
  if (selectedSection === "OVERALL") {
    return [...allStudents];
  }

  return allStudents.filter(
    (student) => student.Section === selectedSection
  );
}


function getDisplayRank(student) {
  if (selectedSection === "OVERALL") {
    return student["Overall Rank"];
  }

  return student["Section Rank"];
}


function sortForDisplay(students) {
  return [...students].sort((a, b) =>
    String(a["Register Number"] || "").localeCompare(
      String(b["Register Number"] || ""),
      undefined,
      { numeric: true }
    )
  );
}


function renderStudents(students) {
  students = sortForDisplay(students);
  visibleStudents = students;

  const overall = selectedSection === "OVERALL";
  const columnCount = overall ? 13 : 12;

  document.querySelectorAll(".overall-only").forEach((element) => {
    element.hidden = !overall;
  });

  if (!students.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="${columnCount}" class="loading-row">
          No matching students found.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = students.map((student) => {
    const rank = getDisplayRank(student);

    const sectionCell = overall
      ? `<td><span class="section-pill">${escapeHTML(student.Section || "–")}</span></td>`
      : "";

    const status = String(student.Status || "Unknown");

    const statusClass =
      status === "Success"
        ? "status-success"
        : status === "Pending"
          ? "status-pending"
          : "status-error";

    return `
      <tr>
        <td>
          <span class="rank-badge">
            ${escapeHTML(rank || "–")}
          </span>
        </td>

        ${sectionCell}

        <td class="register-number-cell">
          ${escapeHTML(student["Register Number"] || "–")}
        </td>

        <td>
          <button
            class="student-name student-profile-link"
            type="button"
            data-profile-register="${escapeHTML(student["Register Number"])}"
            title="Open student progress profile"
          >
            ${escapeHTML(student["Student Name"] || "Student")} ↗
          </button>
        </td>

        <td>
          <a
            class="leetcode-link"
            href="${escapeHTML(
              student["LeetCode Link"]
              || `https://leetcode.com/u/${student["LeetCode Username"] || ""}/`
            )}"
            target="_blank"
            rel="noopener noreferrer"
          >
            ${escapeHTML(student["LeetCode Username"] || "–")}
          </a>
        </td>

        <td><strong>${toNumber(student["Last 30 Days"])}</strong></td>
        <td>${toNumber(student["Last 7 Days"])}</td>
        <td>${toNumber(student["Solved Today"])}</td>
        <td><strong>${toNumber(student["Problems Solved"])}</strong></td>
        <td>${toNumber(student.Easy)}</td>
        <td>${toNumber(student.Medium)}</td>
        <td>${toNumber(student.Hard)}</td>

        <td>
          <span class="student-status ${statusClass}">
            ${escapeHTML(status)}
          </span>
        </td>
      </tr>
    `;
  }).join("");
}


function applySearch() {
  const query = searchInput.value.trim().toLowerCase();
  let students = getCurrentViewStudents();

  if (query) {
    students = students.filter((student) =>
      [
        student["Student Name"],
        student["Register Number"],
        student["LeetCode Username"],
        student["Last Problem"]
      ].some((value) =>
        String(value || "").toLowerCase().includes(query)
      )
    );
  }

  renderStudents(students);

  messageElement.textContent =
    `${students.length} student(s) shown`;
}


function openSection(section) {
  selectedSection = section;
  searchInput.value = "";

  sectionHome.hidden = true;
  leaderboardView.hidden = false;

  if (section === "OVERALL") {
    currentViewLabel.textContent = "DEPARTMENT";
    currentViewTitle.textContent = "Overall ECE Leaderboard";
    printTitle.textContent = "Overall ECE LeetCode Leaderboard";
    rankLegendText.textContent = "Overall Rank";
  } else {
    currentViewLabel.textContent = "SECTION";
    currentViewTitle.textContent = `${section} Leaderboard`;
    printTitle.textContent = `${section} LeetCode Leaderboard`;
    rankLegendText.textContent = "Section Rank";
  }

  applySearch();
}


function showSectionHome() {
  selectedSection = null;
  leaderboardView.hidden = true;
  sectionHome.hidden = false;
  searchInput.value = "";
}


async function loadData() {
  const response = await fetch(
    `LiveData.csv?time=${Date.now()}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error(`LiveData.csv HTTP ${response.status}`);
  }

  allStudents = parseCSV(await response.text());

  // Allow History.csv / DailyActivity.csv to refresh after tracker updates.
  profileDataLoaded = false;

  updateSectionCounts();
  updateLastUpdated();

  if (selectedSection) {
    applySearch();
  }
}


async function fetchAdminRole(user) {
  const { data, error } = await supabaseClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (error || data?.role !== "admin") {
    throw new Error(
      "This account is not authorized as an administrator."
    );
  }

  return "admin";
}


function openAdminLogin() {
  adminLoginMessage.textContent = "";
  adminLoginModal.hidden = false;
}


function closeAdminLoginModal() {
  adminLoginModal.hidden = true;
}


async function handleAdminLogin(event) {
  event.preventDefault();

  adminSignInButton.disabled = true;
  adminSignInButton.textContent = "Checking...";

  try {
    const { data, error } =
      await supabaseClient.auth.signInWithPassword({
        email: adminEmail.value.trim(),
        password: adminPassword.value
      });

    if (error) throw error;

    const role = await fetchAdminRole(data.user);

    currentUser = data.user;
    currentRole = role;

    adminPassword.value = "";

    closeAdminLoginModal();
    updateAdminUI();
  } catch (error) {
    await supabaseClient.auth.signOut().catch(() => {});

    currentUser = null;
    currentRole = null;
    updateAdminUI();

    adminLoginMessage.textContent = error.message;
    adminLoginMessage.className = "form-message error";
  } finally {
    adminSignInButton.disabled = false;
    adminSignInButton.textContent = "Login";
  }
}


async function restoreAdminSession() {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  if (!session?.user) {
    updateAdminUI();
    return;
  }

  try {
    currentRole = await fetchAdminRole(session.user);
    currentUser = session.user;
  } catch {
    await supabaseClient.auth.signOut();
    currentUser = null;
    currentRole = null;
  }

  updateAdminUI();
}


async function adminLogout() {
  await supabaseClient.auth.signOut();

  currentUser = null;
  currentRole = null;
  directoryStudents = [];

  updateAdminUI();
}


async function loadRegisteredStudents() {
  if (!isAdmin()) {
    throw new Error("Administrator access required.");
  }

  const { data, error } = await supabaseClient
    .from("students")
    .select(
      "id,register_number,student_name,leetcode_username,section,created_at"
    )
    .order("section", { ascending: true })
    .order("register_number", { ascending: true });

  if (error) throw error;

  directoryStudents = data || [];
  return directoryStudents;
}


function getFilteredManagedStudents() {
  const section = manageSectionFilter.value;
  const query = manageSearch.value.trim().toLowerCase();

  return directoryStudents.filter((student) => {
    const sectionMatches =
      section === "ALL" || student.section === section;

    const textMatches =
      !query
      || [
        student.register_number,
        student.student_name,
        student.leetcode_username,
        student.section
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);

    return sectionMatches && textMatches;
  });
}


function renderManageStudents() {
  const students = getFilteredManagedStudents();

  manageCount.textContent =
    `${students.length} student${students.length === 1 ? "" : "s"}`;

  if (!students.length) {
    manageStudentsBody.innerHTML = `
      <tr>
        <td colspan="5" class="loading-row">No students found.</td>
      </tr>
    `;
    return;
  }

  manageStudentsBody.innerHTML = students.map((student) => `
    <tr>
      <td><span class="section-pill">${escapeHTML(student.section)}</span></td>

      <td>${escapeHTML(student.register_number)}</td>

      <td>${escapeHTML(student.student_name)}</td>

      <td>
        <a
          class="profile-link"
          href="https://leetcode.com/u/${encodeURIComponent(student.leetcode_username)}/"
          target="_blank"
          rel="noopener noreferrer"
        >
          ${escapeHTML(student.leetcode_username)}
        </a>
      </td>

      <td>
        <button
          class="row-action edit-action"
          type="button"
          data-manage-edit="${escapeHTML(student.id)}"
        >
          Edit
        </button>

        <button
          class="row-action delete-action"
          type="button"
          data-manage-delete="${escapeHTML(student.id)}"
        >
          Delete
        </button>
      </td>
    </tr>
  `).join("");
}


async function openManageStudents() {
  if (!isAdmin()) return;

  manageStudentsModal.hidden = false;

  await loadRegisteredStudents();

  if (selectedSection && selectedSection !== "OVERALL") {
    manageSectionFilter.value = selectedSection;
  } else {
    manageSectionFilter.value = "ALL";
  }

  manageSearch.value = "";
  renderManageStudents();
}


function closeManageStudentsModal() {
  manageStudentsModal.hidden = true;
}


function resetProfileForm() {
  profileForm.reset();
  editingStudentId.value = "";
  formMessage.textContent = "";
  generatedLink.textContent = "https://leetcode.com/u/username/";
}


function openAddModal() {
  if (!isAdmin()) return;

  resetProfileForm();

  if (selectedSection && selectedSection !== "OVERALL") {
    studentSectionInput.value = selectedSection;
  }

  document.getElementById("profileModalTitle").textContent =
    "Add LeetCode Profile";

  saveProfileButton.textContent = "Add User";
  profileModal.hidden = false;
  document.body.classList.add("modal-open");
}


function openEditModal(studentId) {
  const student = directoryStudents.find(
    (item) => String(item.id) === String(studentId)
  );

  if (!student) return;

  resetProfileForm();

  editingStudentId.value = student.id;
  registerNumberInput.value = student.register_number;
  studentNameInput.value = student.student_name;
  usernameInput.value = student.leetcode_username;
  studentSectionInput.value = student.section;

  generatedLink.textContent =
    `https://leetcode.com/u/${student.leetcode_username}/`;

  document.getElementById("profileModalTitle").textContent =
    "Edit LeetCode Profile";

  saveProfileButton.textContent = "Save Changes";

  manageStudentsModal.hidden = true;
  profileModal.hidden = false;
  document.body.classList.add("modal-open");
}


function closeProfile() {
  profileModal.hidden = true;
  document.body.classList.remove("modal-open");
}


async function saveProfile(event) {
  event.preventDefault();

  if (!isAdmin()) return;

  const id = editingStudentId.value.trim();

  const payload = {
    register_number: registerNumberInput.value.trim(),
    student_name: studentNameInput.value.trim(),
    leetcode_username: usernameInput.value.trim(),
    section: studentSectionInput.value
  };

  saveProfileButton.disabled = true;

  try {
    let result;

    if (id) {
      result = await supabaseClient
        .from("students")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
    } else {
      result = await supabaseClient
        .from("students")
        .insert(payload)
        .select()
        .single();
    }

    if (result.error) throw result.error;

    formMessage.textContent =
      id ? "Profile updated successfully." : "Profile added successfully.";

    formMessage.className = "form-message success";

    await loadData();

    setTimeout(closeProfile, 700);
  } catch (error) {
    formMessage.textContent = error.message;
    formMessage.className = "form-message error";
  } finally {
    saveProfileButton.disabled = false;
    saveProfileButton.textContent = id ? "Save Changes" : "Add User";
  }
}


function openDeleteModal(studentId) {
  const student = directoryStudents.find(
    (item) => String(item.id) === String(studentId)
  );

  if (!student) return;

  pendingDeleteId = student.id;

  deleteDescription.textContent =
    `Delete ${student.student_name} (${student.section})?`;

  deleteModal.hidden = false;
}


function closeDelete() {
  deleteModal.hidden = true;
  pendingDeleteId = null;
}


async function confirmDelete() {
  if (!isAdmin() || pendingDeleteId === null) return;

  confirmDeleteButton.disabled = true;

  try {
    const { error } = await supabaseClient
      .from("students")
      .delete()
      .eq("id", pendingDeleteId);

    if (error) throw error;

    closeDelete();

    await loadRegisteredStudents();
    renderManageStudents();
    await loadData();
  } catch (error) {
    deleteMessage.textContent = error.message;
    deleteMessage.className = "form-message error";
  } finally {
    confirmDeleteButton.disabled = false;
  }
}


async function triggerLeetCodeSync() {
  if (!isAdmin()) return;

  const buttons = [syncNowButton, homeSyncNowButton].filter(Boolean);

  buttons.forEach((button) => {
    button.disabled = true;
    button.textContent = "Syncing...";
  });

  try {
    const { data, error } =
      await supabaseClient.functions.invoke(
        "super-action",
        {
          body: { source: "admin-sync-button" }
        }
      );

    if (error) throw error;

    if (messageElement) {
      messageElement.textContent =
        "LeetCode sync started. GitHub Actions is checking all profiles.";
    }

    console.log(data);
  } catch (error) {
    if (messageElement) {
      messageElement.textContent =
        `Unable to start sync: ${error.message}`;
    }
  } finally {
    setTimeout(() => {
      buttons.forEach((button) => {
        button.disabled = false;
        button.textContent = "↻ Sync Now";
      });
    }, 4000);
  }
}


function csvEscape(value) {
  const text = String(value ?? "");

  return /[",\n]/.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}


function downloadCSV() {
  const rows = [
    exportColumns,
    ...visibleStudents.map((student) =>
      exportColumns.map((column) => student[column] ?? "")
    )
  ];

  const blob = new Blob(
    [
      "\uFEFF"
      + rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")
    ],
    { type: "text/csv;charset=utf-8" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  const fileName =
    selectedSection === "OVERALL"
      ? "ECE_Overall_Leaderboard.csv"
      : `${selectedSection.replace(" ", "_")}_Leaderboard.csv`;

  link.href = url;
  link.download = fileName;
  link.click();

  URL.revokeObjectURL(url);
}


function downloadPDF() {
  window.print();
}






// ============================================================
// DAILY CHALLENGE
// ============================================================

let dailyChallenges = [];
let dailyChallengeResults = [];

function localISODate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000)
    .toISOString().slice(0, 10);
}

async function loadDailyChallengeData() {
  if (!supabaseClient) return;

  const [{ data: challenges, error: challengeError },
         { data: results, error: resultError }] = await Promise.all([
    supabaseClient.from("daily_challenges")
      .select("*").order("challenge_date", { ascending: true }),
    supabaseClient.from("daily_challenge_results")
      .select("*")
  ]);

  if (challengeError) throw challengeError;
  if (resultError) throw resultError;

  dailyChallenges = challenges || [];
  dailyChallengeResults = results || [];

  renderDailyChallengeHome();
  renderSectionChallengeMiniStats();

  if (
    !document.getElementById("facultyAnalyticsModal")?.hidden
  ) {
    renderFacultyAnalytics();
  }
}

function getTodayChallenge() {
  const today = localISODate();
  return dailyChallenges.find((item) => item.challenge_date === today) || null;
}

function studentChallengeStats(registerNumber) {
  const completedByChallenge = new Map();

  dailyChallengeResults
    .filter(
      (result) =>
        String(result.register_number) === String(registerNumber)
    )
    .forEach(
      (result) =>
        completedByChallenge.set(
          Number(result.challenge_id),
          Boolean(result.completed)
        )
    );

  const today = localISODate();

  const ordered = [...dailyChallenges]
    .filter(
      (challenge) =>
        String(challenge.challenge_date) <= today
    )
    .sort(
      (a, b) =>
        String(a.challenge_date).localeCompare(
          String(b.challenge_date)
        )
    );

  let totalCompleted = 0;
  let longestStreak = 0;
  let runningStreak = 0;

  for (const challenge of ordered) {
    const done =
      completedByChallenge.get(Number(challenge.id)) === true;

    if (done) {
      totalCompleted += 1;
      runningStreak += 1;
      longestStreak = Math.max(
        longestStreak,
        runningStreak
      );
    } else {
      runningStreak = 0;
    }
  }

  let currentStreak = 0;

  for (
    let index = ordered.length - 1;
    index >= 0;
    index -= 1
  ) {
    const challenge = ordered[index];
    const done =
      completedByChallenge.get(Number(challenge.id)) === true;

    if (done) {
      currentStreak += 1;
    } else {
      break;
    }
  }

  const totalChallenges = ordered.length;

  const completionRate =
    totalChallenges > 0
      ? (totalCompleted / totalChallenges) * 100
      : 0;

  return {
    totalCompleted,
    totalChallenges,
    completionRate,
    currentStreak,
    longestStreak
  };
}


function getSectionChallengeStats(section) {
  const students = allStudents.filter(
    (student) =>
      normalizeSection(student.Section)
      === normalizeSection(section)
  );

  const stats = students.map(
    (student) =>
      studentChallengeStats(student["Register Number"])
  );

  const totalCompleted = stats.reduce(
    (sum, stat) => sum + stat.totalCompleted,
    0
  );

  const studentsWithStreak = stats.filter(
    (stat) => stat.currentStreak > 0
  ).length;

  const averageCompleted =
    students.length > 0
      ? totalCompleted / students.length
      : 0;

  const todayChallenge = getTodayChallenge();

  const todayCompleted =
    todayChallenge
      ? students.filter(
          (student) =>
            dailyChallengeResults.some(
              (result) =>
                Number(result.challenge_id) === Number(todayChallenge.id)
                && String(result.register_number) === String(student["Register Number"])
                && result.completed
            )
        ).length
      : 0;

  const todayRate =
    students.length > 0
      ? (todayCompleted / students.length) * 100
      : 0;

  return {
    students: students.length,
    totalCompleted,
    studentsWithStreak,
    averageCompleted,
    todayCompleted,
    todayRate
  };
}

function renderSectionChallengeMiniStats() {
  SECTION_NAMES.forEach((section) => {
    const key = section.replace(/\s+/g, "");
    const completedElement =
      document.getElementById(`challengeCompleted${key}`);
    const streakElement =
      document.getElementById(`challengeBestStreak${key}`);

    if (!completedElement || !streakElement) return;

    const stats = getSectionChallengeStats(section);

    completedElement.textContent =
      `${stats.todayCompleted}/${stats.students}`;

    streakElement.textContent =
      stats.studentsWithStreak;
  });
}

function renderDailyChallengeHome() {
  const title = document.getElementById("dailyChallengeHomeTitle");
  const progress = document.getElementById("dailyChallengeHomeProgress");
  if (!title || !progress) return;

  const challenge = getTodayChallenge();
  if (!challenge) {
    title.textContent = "No challenge posted";
    progress.textContent = "Admin can post today's problem";
    return;
  }

  const completed = dailyChallengeResults.filter(
    (r) => Number(r.challenge_id) === Number(challenge.id) && r.completed
  ).length;

  title.textContent = challenge.problem_title;
  progress.textContent = `${completed} / ${allStudents.length} completed today`;
}

function renderDailyChallengeModal() {
  const challenge = getTodayChallenge();
  const title = document.getElementById("todayChallengeTitle");
  const dateText = document.getElementById("todayChallengeDate");
  const difficulty = document.getElementById("todayChallengeDifficulty");
  const link = document.getElementById("todayChallengeLink");

  if (!challenge) {
    title.textContent = "No challenge posted today";
    dateText.textContent = localISODate();
    difficulty.textContent = "—";
    link.hidden = true;
  } else {
    title.textContent =
      `${challenge.problem_number ? `#${challenge.problem_number} · ` : ""}${challenge.problem_title}`;
    dateText.textContent = challenge.challenge_date;
    difficulty.textContent = challenge.difficulty;
    link.href = challenge.problem_url;
    link.hidden = false;
  }

  const todayResults = challenge
    ? dailyChallengeResults.filter((r) => Number(r.challenge_id) === Number(challenge.id))
    : [];

  const completed = todayResults.filter((r) => r.completed).length;
  const total = allStudents.length;
  const pending = Math.max(0, total - completed);

  document.getElementById("challengeCompletedCount").textContent = completed;
  document.getElementById("challengePendingCount").textContent = pending;
  document.getElementById("challengeStudentCount").textContent = total;
  document.getElementById("challengeCompletionRate").textContent =
    `${total ? (completed / total * 100).toFixed(1) : "0.0"}%`;

  renderChallengeLeaderboard();
  renderChallengeStudentStatus();
}

function renderChallengeLeaderboard() {
  const body = document.getElementById("challengeLeaderboardBody");
  if (!body) return;

  const today = getTodayChallenge();

  const rows = allStudents.map((student) => {
    const stats = studentChallengeStats(student["Register Number"]);
    const todayDone = today && dailyChallengeResults.some(
      (r) =>
        Number(r.challenge_id) === Number(today.id)
        && String(r.register_number) === String(student["Register Number"])
        && r.completed
    );

    return { student, ...stats, todayDone };
  }).sort((a, b) =>
    b.totalCompleted - a.totalCompleted
    || b.currentStreak - a.currentStreak
    || b.longestStreak - a.longestStreak
    || String(a.student["Student Name"]).localeCompare(String(b.student["Student Name"]))
  );

  body.innerHTML = rows.map((row, index) => `
    <tr>
      <td><strong>${championRankBadge(index + 1)}</strong></td>
      <td>${escapeHTML(row.student["Student Name"])}</td>
      <td>${escapeHTML(row.student.Section || "—")}</td>
      <td><strong>${row.totalCompleted}</strong></td>
      <td>🔥 ${row.currentStreak}</td>
      <td>${row.longestStreak}</td>
      <td>${row.todayDone ? "✅" : "❌"}</td>
    </tr>
  `).join("");
}

function renderChallengeStudentStatus() {
  const container = document.getElementById("challengeStudentStatus");
  const filter = document.getElementById("challengeSectionFilter");
  if (!container || !filter) return;

  const challenge = getTodayChallenge();
  let students = [...allStudents];

  if (filter.value !== "ALL") {
    students = students.filter(
      (s) => normalizeSection(s.Section) === normalizeSection(filter.value)
    );
  }

  container.innerHTML = students.map((student) => {
    const done = challenge && dailyChallengeResults.some(
      (r) =>
        Number(r.challenge_id) === Number(challenge.id)
        && String(r.register_number) === String(student["Register Number"])
        && r.completed
    );
    const stats = studentChallengeStats(student["Register Number"]);

    return `
      <div class="challenge-status-card ${done ? "done" : "pending"}">
        <span class="challenge-status-icon">${done ? "✅" : "❌"}</span>
        <div>
          <strong>${escapeHTML(student["Student Name"])}</strong>
          <small>${escapeHTML(student.Section || "—")} · ${escapeHTML(student["Register Number"])}</small>
        </div>
        <div class="challenge-mini-stats">
          <span>🔥 ${stats.currentStreak}</span>
          <span>✅ ${stats.totalCompleted}</span>
        </div>
      </div>
    `;
  }).join("");
}

function openDailyChallenge() {
  renderDailyChallengeModal();
  document.getElementById("dailyChallengeModal").hidden = false;
  document.body.classList.add("modal-open");
}

function closeDailyChallenge() {
  document.getElementById("dailyChallengeModal").hidden = true;
  document.body.classList.remove("modal-open");
}

function openPostChallenge() {
  if (!isAdmin()) return;
  document.getElementById("challengeDateInput").value = localISODate();
  document.getElementById("postChallengeMessage").textContent = "";
  document.getElementById("postChallengeModal").hidden = false;
  document.body.classList.add("modal-open");
}

function closePostChallenge() {
  document.getElementById("postChallengeModal").hidden = true;
  document.body.classList.remove("modal-open");
}

async function submitDailyChallenge(event) {
  event.preventDefault();
  if (!isAdmin()) return;

  const challengeDate = document.getElementById("challengeDateInput").value;
  const payload = {
    challenge_date: challengeDate,
    problem_number: Number(document.getElementById("challengeNumberInput").value) || null,
    problem_title: document.getElementById("challengeTitleInput").value.trim(),
    problem_slug: document.getElementById("challengeSlugInput").value.trim().toLowerCase(),
    problem_url: document.getElementById("challengeUrlInput").value.trim(),
    difficulty: document.getElementById("challengeDifficultyInput").value,
    created_by: currentUser?.id || null
  };

  const message = document.getElementById("postChallengeMessage");
  message.textContent = "Posting...";

  const { error } = await supabaseClient
    .from("daily_challenges")
    .upsert(payload, { onConflict: "challenge_date" });

  if (error) {
    message.textContent = error.message;
    message.className = "form-message error";
    return;
  }

  message.textContent = "Challenge posted successfully.";
  message.className = "form-message success";

  await loadDailyChallengeData();
  setTimeout(closePostChallenge, 500);
}

document.getElementById("dailyChallengeCardButton")
  ?.addEventListener("click", openDailyChallenge);

document.getElementById("closeDailyChallengeButton")
  ?.addEventListener("click", closeDailyChallenge);

document.querySelectorAll("[data-close-daily-challenge]")
  .forEach((el) => el.addEventListener("click", closeDailyChallenge));

document.getElementById("homePostChallengeButton")
  ?.addEventListener("click", openPostChallenge);

document.querySelectorAll("[data-close-post-challenge]")
  .forEach((el) => el.addEventListener("click", closePostChallenge));

document.getElementById("postChallengeForm")
  ?.addEventListener("submit", submitDailyChallenge);

document.getElementById("challengeSectionFilter")
  ?.addEventListener("change", renderChallengeStudentStatus);


// ============================================================
// PUBLIC CHAMPIONS VIEW
// ============================================================

function compareChampionStudents(a, b) {
  return (
    toNumber(b["Last 30 Days"]) - toNumber(a["Last 30 Days"])
    || toNumber(b["Last 7 Days"]) - toNumber(a["Last 7 Days"])
    || toNumber(b["Problems Solved"]) - toNumber(a["Problems Solved"])
    || String(a["Student Name"] || "").localeCompare(
      String(b["Student Name"] || "")
    )
  );
}

function calculateChampionsSectionRanking() {
  return SECTION_NAMES.map((section) => {
    const students = allStudents.filter(
      (student) =>
        normalizeSection(student.Section) === normalizeSection(section)
    );

    const last30 = students.reduce(
      (sum, student) => sum + toNumber(student["Last 30 Days"]),
      0
    );

    const last7 = students.reduce(
      (sum, student) => sum + toNumber(student["Last 7 Days"]),
      0
    );

    const active = students.filter(
      (student) => toNumber(student["Last 30 Days"]) > 0
    ).length;

    const average =
      students.length > 0 ? last30 / students.length : 0;

    return {
      section,
      students: students.length,
      last30,
      last7,
      active,
      average
    };
  }).sort((a, b) =>
    b.last30 - a.last30
    || b.last7 - a.last7
    || b.active - a.active
    || b.average - a.average
    || a.section.localeCompare(b.section)
  );
}

function championRankBadge(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

function renderChampionsSectionRanking() {
  const container =
    document.getElementById("championsSectionRanking");

  if (!container) return;

  const ranking = calculateChampionsSectionRanking();

  container.innerHTML = ranking.map((item, index) => `
    <button
      type="button"
      class="champions-rank-card"
      data-open-section="${escapeHTML(item.section)}"
    >
      <div class="champions-rank-card-top">
        <span class="champions-rank-badge">
          ${championRankBadge(index + 1)}
        </span>

        <strong>${escapeHTML(item.section)}</strong>
      </div>

      <div class="champions-rank-stats">
        <span>
          <small>30 Days</small>
          <strong>${item.last30}</strong>
        </span>

        <span>
          <small>7 Days</small>
          <strong>${item.last7}</strong>
        </span>

        <span>
          <small>Active</small>
          <strong>${item.active}</strong>
        </span>

        <span>
          <small>Students</small>
          <strong>${item.students}</strong>
        </span>
      </div>

      <div class="champions-rank-average">
        Avg / Student: <strong>${item.average.toFixed(1)}</strong>
      </div>
    </button>
  `).join("");
}

function getSectionChampion(section) {
  return [...allStudents]
    .filter(
      (student) =>
        normalizeSection(student.Section) === normalizeSection(section)
    )
    .sort(compareChampionStudents)[0] || null;
}

function renderSectionChampions() {
  const grid =
    document.getElementById("sectionChampionsGrid");

  if (!grid) return;

  grid.innerHTML = SECTION_NAMES.map((section) => {
    const champion = getSectionChampion(section);

    if (!champion) {
      return `
        <article class="section-champion-card empty-champion-card">
          <div class="section-champion-top">
            <span class="section-champion-crown">🏆</span>
            <span class="section-pill">${escapeHTML(section)}</span>
          </div>

          <h4>No student data yet</h4>
          <p>Add students to ${escapeHTML(section)}.</p>
        </article>
      `;
    }

    return `
      <button
        type="button"
        class="section-champion-card"
        data-champion-profile="${escapeHTML(champion["Register Number"])}"
      >
        <div class="section-champion-top">
          <span class="section-champion-crown">🏆</span>
          <span class="section-pill">${escapeHTML(section)}</span>
        </div>

        <h4>${escapeHTML(champion["Student Name"])}</h4>
        <p>${escapeHTML(champion["Register Number"])}</p>

        <div class="section-champion-metrics">
          <span>
            <small>30 Days</small>
            <strong>${toNumber(champion["Last 30 Days"])}</strong>
          </span>

          <span>
            <small>7 Days</small>
            <strong>${toNumber(champion["Last 7 Days"])}</strong>
          </span>

          <span>
            <small>Total</small>
            <strong>${toNumber(champion["Problems Solved"])}</strong>
          </span>
        </div>

        <span class="open-profile-hint">Open Profile ↗</span>
      </button>
    `;
  }).join("");
}

function renderOverallTopFive() {
  const container =
    document.getElementById("overallTopFive");

  if (!container) return;

  const students = [...allStudents]
    .sort(compareChampionStudents)
    .slice(0, 5);

  if (!students.length) {
    container.innerHTML = `
      <div class="champions-empty">
        No student data available.
      </div>
    `;
    return;
  }

  container.innerHTML = students.map((student, index) => {
    const rank = index + 1;

    return `
      <button
        type="button"
        class="overall-top-student top-student-${rank}"
        data-champion-profile="${escapeHTML(student["Register Number"])}"
      >
        <span class="overall-top-rank">
          ${championRankBadge(rank)}
        </span>

        <div class="overall-top-identity">
          <strong>${escapeHTML(student["Student Name"])}</strong>
          <span>
            ${escapeHTML(student.Section || "–")}
            · ${escapeHTML(student["Register Number"])}
          </span>
        </div>

        <div class="overall-top-metrics">
          <span>
            <small>30 Days</small>
            <strong>${toNumber(student["Last 30 Days"])}</strong>
          </span>

          <span>
            <small>7 Days</small>
            <strong>${toNumber(student["Last 7 Days"])}</strong>
          </span>

          <span>
            <small>Total</small>
            <strong>${toNumber(student["Problems Solved"])}</strong>
          </span>
        </div>
      </button>
    `;
  }).join("");
}

function renderChampions() {
  renderChampionsSectionRanking();
  renderSectionChampions();
  renderOverallTopFive();
}

function openChampions() {
  const modal =
    document.getElementById("championsModal");

  if (!modal) return;

  renderChampions();

  modal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeChampions() {
  const modal =
    document.getElementById("championsModal");

  if (!modal) return;

  modal.hidden = true;

  const anyOpenModal = document.querySelector(
    ".profile-modal:not([hidden]),"
    + ".student-profile-modal:not([hidden]),"
    + ".faculty-analytics-modal:not([hidden]),"
    + ".champions-modal:not([hidden])"
  );

  if (!anyOpenModal) {
    document.body.classList.remove("modal-open");
  }
}

const championsHomeButton =
  document.getElementById("championsCardButton");

if (championsHomeButton) {
  championsHomeButton.addEventListener(
    "click",
    openChampions
  );
}

const championsCloseButton =
  document.getElementById("closeChampionsButton");

if (championsCloseButton) {
  championsCloseButton.addEventListener(
    "click",
    closeChampions
  );
}

const championsModalElement =
  document.getElementById("championsModal");

if (championsModalElement) {
  championsModalElement
    .querySelectorAll("[data-close-champions]")
    .forEach((element) => {
      element.addEventListener(
        "click",
        closeChampions
      );
    });

  championsModalElement.addEventListener(
    "click",
    (event) => {
      const profileTarget =
        event.target.closest("[data-champion-profile]");

      if (profileTarget) {
        const registerNumber =
          profileTarget.dataset.championProfile;

        closeChampions();
        openStudentProfile(registerNumber);
        return;
      }

      const sectionTarget =
        event.target.closest("[data-open-section]");

      if (sectionTarget) {
        const section =
          sectionTarget.dataset.openSection;

        closeChampions();
        openSection(section);
      }
    }
  );
}


// ============================================================
// ADMIN FACULTY ANALYTICS DASHBOARD
// ============================================================

function getFacultyAnalyticsStudents() {
  const filter =
    document.getElementById("analyticsSectionFilter");

  const section =
    filter ? filter.value : "ALL";

  if (section === "ALL") {
    return [...allStudents];
  }

  return allStudents.filter(
    (student) =>
      normalizeSection(student.Section) === normalizeSection(section)
  );
}

function renderFacultyAnalyticsKpis(students) {
  const totalStudents = students.length;

  const activeToday = students.filter(
    (student) => toNumber(student["Solved Today"]) > 0
  ).length;

  const active7Days = students.filter(
    (student) => toNumber(student["Last 7 Days"]) > 0
  ).length;

  const inactive7Days =
    Math.max(0, totalStudents - active7Days);

  const solves30Days = students.reduce(
    (sum, student) => sum + toNumber(student["Last 30 Days"]),
    0
  );

  const average30 =
    totalStudents > 0 ? solves30Days / totalStudents : 0;

  document.getElementById("analyticsTotalStudents").textContent = totalStudents;
  document.getElementById("analyticsActiveToday").textContent = activeToday;
  document.getElementById("analyticsActive7Days").textContent = active7Days;
  document.getElementById("analyticsInactive7Days").textContent = inactive7Days;
  document.getElementById("analytics30DaySolves").textContent = solves30Days;
  document.getElementById("analyticsAverage30").textContent = average30.toFixed(1);

  const challengeStats = students.map(
    (student) => studentChallengeStats(student["Register Number"])
  );

  const activeChallengeStreaks =
    challengeStats.filter((stat) => stat.currentStreak > 0).length;

  const todayChallenge = getTodayChallenge();

  const todayCompleted =
    todayChallenge
      ? students.filter(
          (student) =>
            dailyChallengeResults.some(
              (result) =>
                Number(result.challenge_id) === Number(todayChallenge.id)
                && String(result.register_number) === String(student["Register Number"])
                && result.completed
            )
        ).length
      : 0;

  const todayRate =
    totalStudents > 0
      ? (todayCompleted / totalStudents) * 100
      : 0;

  document.getElementById("analyticsChallengeTodayRate").textContent =
    `${todayRate.toFixed(1)}%`;

  document.getElementById("analyticsChallengeTodayCount").textContent =
    `${todayCompleted} / ${totalStudents} completed`;

  document.getElementById("analyticsChallengeActiveStreaks").textContent =
    activeChallengeStreaks;
}

function renderFacultySectionBars() {
  const sectionData = SECTION_NAMES.map((section) => {
    const students = allStudents.filter(
      (student) =>
        normalizeSection(student.Section) === normalizeSection(section)
    );

    return {
      section,
      value: students.reduce(
        (sum, student) =>
          sum + toNumber(student["Last 30 Days"]),
        0
      )
    };
  });

  const maximum = Math.max(
    1,
    ...sectionData.map((item) => item.value)
  );

  const container =
    document.getElementById("analyticsSectionBars");

  if (!container) return;

  container.innerHTML = sectionData.map((item) => `
    <div class="analytics-bar-row">
      <span>${escapeHTML(item.section)}</span>

      <div class="analytics-bar-track">
        <span
          class="analytics-bar-fill"
          style="width:${
            item.value
              ? Math.max(4, item.value / maximum * 100)
              : 0
          }%"
        ></span>
      </div>

      <strong>${item.value}</strong>
    </div>
  `).join("");
}

function renderFacultyDifficulty(students) {
  const values = [
    ["Easy", students.reduce(
      (sum, student) => sum + toNumber(student.Easy),
      0
    )],
    ["Medium", students.reduce(
      (sum, student) => sum + toNumber(student.Medium),
      0
    )],
    ["Hard", students.reduce(
      (sum, student) => sum + toNumber(student.Hard),
      0
    )]
  ];

  const maximum = Math.max(
    1,
    ...values.map((item) => item[1])
  );

  const container =
    document.getElementById("analyticsDifficultyBars");

  if (!container) return;

  container.innerHTML = values.map(([label, value]) => `
    <div class="analytics-bar-row">
      <span>${label}</span>

      <div class="analytics-bar-track">
        <span
          class="analytics-bar-fill analytics-${label.toLowerCase()}"
          style="width:${
            value
              ? Math.max(4, value / maximum * 100)
              : 0
          }%"
        ></span>
      </div>

      <strong>${value}</strong>
    </div>
  `).join("");
}

function renderFacultyTopStudents(students) {
  const body =
    document.getElementById("analyticsTopStudents");

  if (!body) return;

  const rows = [...students]
    .sort(compareChampionStudents)
    .slice(0, 10);

  if (!rows.length) {
    body.innerHTML = `
      <tr>
        <td colspan="6" class="analytics-empty">
          No students in this scope.
        </td>
      </tr>
    `;
    return;
  }

  body.innerHTML = rows.map((student, index) => `
    <tr>
      <td><strong>#${index + 1}</strong></td>

      <td>
        <button
          type="button"
          class="analytics-student-link"
          data-analytics-profile="${escapeHTML(student["Register Number"])}"
        >
          ${escapeHTML(student["Student Name"])}
        </button>
      </td>

      <td>${escapeHTML(student.Section || "–")}</td>
      <td><strong>${toNumber(student["Last 30 Days"])}</strong></td>
      <td>${toNumber(student["Last 7 Days"])}</td>
      <td>${toNumber(student["Problems Solved"])}</td>
    </tr>
  `).join("");
}

function renderFacultyBottomStudents(students) {
  const body =
    document.getElementById("analyticsBottomStudents");

  if (!body) return;

  const rows = [...students]
    .sort((a, b) =>
      toNumber(a["Last 30 Days"]) - toNumber(b["Last 30 Days"])
      || toNumber(a["Last 7 Days"]) - toNumber(b["Last 7 Days"])
      || toNumber(a["Problems Solved"]) - toNumber(b["Problems Solved"])
      || String(a["Student Name"] || "").localeCompare(
        String(b["Student Name"] || "")
      )
    )
    .slice(0, 10);

  if (!rows.length) {
    body.innerHTML = `
      <tr>
        <td colspan="6" class="analytics-empty">
          No students in this scope.
        </td>
      </tr>
    `;
    return;
  }

  body.innerHTML = rows.map((student, index) => `
    <tr>
      <td><strong>#${index + 1}</strong></td>
      <td>
        <button
          type="button"
          class="analytics-student-link"
          data-analytics-profile="${escapeHTML(student["Register Number"])}"
        >
          ${escapeHTML(student["Student Name"])}
        </button>
      </td>
      <td>${escapeHTML(student.Section || "–")}</td>
      <td><strong>${toNumber(student["Last 30 Days"])}</strong></td>
      <td>${toNumber(student["Last 7 Days"])}</td>
      <td>${toNumber(student["Problems Solved"])}</td>
    </tr>
  `).join("");
}

function renderFacultyOverallBest7Days() {
  const body =
    document.getElementById("analyticsOverallBest7");

  if (!body) return;

  const rows = [...allStudents]
    .sort((a, b) =>
      toNumber(b["Last 7 Days"]) - toNumber(a["Last 7 Days"])
      || toNumber(b["Last 30 Days"]) - toNumber(a["Last 30 Days"])
      || toNumber(b["Problems Solved"]) - toNumber(a["Problems Solved"])
      || String(a["Student Name"] || "").localeCompare(
        String(b["Student Name"] || "")
      )
    )
    .slice(0, 10);

  body.innerHTML = rows.length
    ? rows.map((student, index) => `
        <tr>
          <td><strong>${championRankBadge(index + 1)}</strong></td>
          <td>
            <button
              type="button"
              class="analytics-student-link"
              data-analytics-profile="${escapeHTML(student["Register Number"])}"
            >
              ${escapeHTML(student["Student Name"])}
            </button>
          </td>
          <td>${escapeHTML(student.Section || "–")}</td>
          <td><strong>${toNumber(student["Last 7 Days"])}</strong></td>
          <td>${toNumber(student["Last 30 Days"])}</td>
          <td>${toNumber(student["Problems Solved"])}</td>
        </tr>
      `).join("")
    : `
      <tr>
        <td colspan="6" class="analytics-empty">
          No student data available.
        </td>
      </tr>
    `;
}

function renderFacultyOverallBest30Days() {
  const body =
    document.getElementById("analyticsOverallBest30");

  if (!body) return;

  const rows = [...allStudents]
    .sort((a, b) =>
      toNumber(b["Last 30 Days"]) - toNumber(a["Last 30 Days"])
      || toNumber(b["Last 7 Days"]) - toNumber(a["Last 7 Days"])
      || toNumber(b["Problems Solved"]) - toNumber(a["Problems Solved"])
      || String(a["Student Name"] || "").localeCompare(
        String(b["Student Name"] || "")
      )
    )
    .slice(0, 10);

  body.innerHTML = rows.length
    ? rows.map((student, index) => `
        <tr>
          <td><strong>${championRankBadge(index + 1)}</strong></td>
          <td>
            <button
              type="button"
              class="analytics-student-link"
              data-analytics-profile="${escapeHTML(student["Register Number"])}"
            >
              ${escapeHTML(student["Student Name"])}
            </button>
          </td>
          <td>${escapeHTML(student.Section || "–")}</td>
          <td><strong>${toNumber(student["Last 30 Days"])}</strong></td>
          <td>${toNumber(student["Last 7 Days"])}</td>
          <td>${toNumber(student["Problems Solved"])}</td>
        </tr>
      `).join("")
    : `
      <tr>
        <td colspan="6" class="analytics-empty">
          No student data available.
        </td>
      </tr>
    `;
}

function renderFacultySectionSummary() {
  const body =
    document.getElementById("analyticsSectionSummary");

  if (!body) return;

  body.innerHTML = SECTION_NAMES.map((section) => {
    const students = allStudents.filter(
      (student) =>
        normalizeSection(student.Section) === normalizeSection(section)
    );

    const activeToday = students.filter(
      (student) =>
        toNumber(student["Solved Today"]) > 0
    ).length;

    const active7 = students.filter(
      (student) =>
        toNumber(student["Last 7 Days"]) > 0
    ).length;

    const total30 = students.reduce(
      (sum, student) =>
        sum + toNumber(student["Last 30 Days"]),
      0
    );

    const average =
      students.length > 0
        ? total30 / students.length
        : 0;

    return `
      <tr>
        <td><strong>${escapeHTML(section)}</strong></td>
        <td>${students.length}</td>
        <td>${activeToday}</td>
        <td>${active7}</td>
        <td>${total30}</td>
        <td>${average.toFixed(1)}</td>
      </tr>
    `;
  }).join("");
}


function renderFacultyChallengeSectionSummary() {
  const body =
    document.getElementById("analyticsChallengeSectionSummary");

  if (!body) return;

  body.innerHTML = SECTION_NAMES.map((section) => {
    const stats = getSectionChallengeStats(section);

    return `
      <tr>
        <td><strong>${escapeHTML(section)}</strong></td>
        <td><strong>${stats.todayCompleted} / ${stats.students}</strong></td>
        <td>${stats.todayRate.toFixed(1)}%</td>
        <td>🔥 ${stats.studentsWithStreak}</td>
        <td>${stats.averageCompleted.toFixed(1)}</td>
      </tr>
    `;
  }).join("");
}

function renderFacultyAnalytics() {
  const students =
    getFacultyAnalyticsStudents();

  const filter =
    document.getElementById("analyticsSectionFilter");

  const scope =
    filter ? filter.value : "ALL";

  const label =
    document.getElementById("analyticsScopeLabel");

  if (label) {
    label.textContent =
      scope === "ALL"
        ? "All Sections"
        : scope;
  }

  renderFacultyAnalyticsKpis(students);
  renderFacultySectionBars();
  renderFacultyDifficulty(students);
  renderFacultyTopStudents(students);
  renderFacultyBottomStudents(students);

  // Overall best tables always use all ECE A-F students.
  renderFacultyOverallBest7Days();
  renderFacultyOverallBest30Days();

  renderFacultyChallengeSectionSummary();
  renderFacultyCodingAnalytics(students);
  renderFacultySectionSummary();
}


function facultyReportScopeName() {
  const filter =
    document.getElementById("analyticsSectionFilter");

  return (
    !filter || filter.value === "ALL"
      ? "Overall_ECE"
      : filter.value.replace(/\s+/g, "_")
  );
}

function facultyReportDate() {
  return localISODate();
}

function htmlEscapeForReport(value) {
  return escapeHTML(value ?? "");
}

function buildFacultyReportHtml() {
  const students = getFacultyAnalyticsStudents();
  const scope =
    document.getElementById("analyticsSectionFilter")?.value || "ALL";

  const totalStudents = students.length;
  const activeToday = students.filter(
    (student) => toNumber(student["Solved Today"]) > 0
  ).length;
  const active7 = students.filter(
    (student) => toNumber(student["Last 7 Days"]) > 0
  ).length;
  const inactive7 = Math.max(0, totalStudents - active7);
  const total30 = students.reduce(
    (sum, student) => sum + toNumber(student["Last 30 Days"]),
    0
  );
  const avg30 =
    totalStudents ? total30 / totalStudents : 0;

  const todayChallenge = getTodayChallenge();
  const todayCompleted =
    todayChallenge
      ? students.filter(
          (student) =>
            dailyChallengeResults.some(
              (result) =>
                Number(result.challenge_id) === Number(todayChallenge.id)
                && String(result.register_number) === String(student["Register Number"])
                && result.completed
            )
        ).length
      : 0;

  const todayRate =
    totalStudents ? (todayCompleted / totalStudents) * 100 : 0;

  const studentsOnStreak = students.filter(
    (student) =>
      studentChallengeStats(student["Register Number"]).currentStreak > 0
  ).length;

  const top10 = [...students]
    .sort(compareChampionStudents)
    .slice(0, 10);

  const bottom10 = [...students]
    .sort((a, b) =>
      toNumber(a["Last 30 Days"]) - toNumber(b["Last 30 Days"])
      || toNumber(a["Last 7 Days"]) - toNumber(b["Last 7 Days"])
      || toNumber(a["Problems Solved"]) - toNumber(b["Problems Solved"])
      || String(a["Student Name"] || "").localeCompare(
        String(b["Student Name"] || "")
      )
    )
    .slice(0, 10);

  const best7 = [...allStudents]
    .sort((a, b) =>
      toNumber(b["Last 7 Days"]) - toNumber(a["Last 7 Days"])
      || toNumber(b["Last 30 Days"]) - toNumber(a["Last 30 Days"])
      || toNumber(b["Problems Solved"]) - toNumber(a["Problems Solved"])
    )
    .slice(0, 10);

  const best30 = [...allStudents]
    .sort(compareChampionStudents)
    .slice(0, 10);

  const sectionRows = SECTION_NAMES.map((section) => {
    const sectionStudents = allStudents.filter(
      (student) =>
        normalizeSection(student.Section) === normalizeSection(section)
    );

    const section30 = sectionStudents.reduce(
      (sum, student) => sum + toNumber(student["Last 30 Days"]),
      0
    );

    const sectionActive7 = sectionStudents.filter(
      (student) => toNumber(student["Last 7 Days"]) > 0
    ).length;

    const challengeStats = getSectionChallengeStats(section);

    return {
      section,
      students: sectionStudents.length,
      active7: sectionActive7,
      solves30: section30,
      avg30: sectionStudents.length ? section30 / sectionStudents.length : 0,
      todayCompleted: challengeStats.todayCompleted,
      todayRate: challengeStats.todayRate,
      onStreak: challengeStats.studentsWithStreak
    };
  });

  function studentRows(rows, primaryLabel) {
    return rows.map((student, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${htmlEscapeForReport(student["Register Number"])}</td>
        <td>${htmlEscapeForReport(student["Student Name"])}</td>
        <td>${htmlEscapeForReport(student.Section || "")}</td>
        <td>${toNumber(student["Last 7 Days"])}</td>
        <td>${toNumber(student["Last 30 Days"])}</td>
        <td>${toNumber(student["Problems Solved"])}</td>
        <td>${htmlEscapeForReport(student.Status || "")}</td>
      </tr>
    `).join("");
  }

  return `
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; }
        h1, h2 { margin-bottom: 6px; }
        p { margin-top: 0; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 24px; }
        th, td { border: 1px solid #999; padding: 7px; text-align: left; }
        th { background: #e9eef5; }
        .summary td:first-child { font-weight: bold; }
      </style>
    </head>
    <body>
      <h1>ECE LeetCode Faculty Analytics Report</h1>
      <p>Scope: ${htmlEscapeForReport(scope === "ALL" ? "All Sections" : scope)}</p>
      <p>Report Date: ${facultyReportDate()}</p>

      <h2>Summary</h2>
      <table class="summary">
        <tr><td>Total Students</td><td>${totalStudents}</td></tr>
        <tr><td>Active Today</td><td>${activeToday}</td></tr>
        <tr><td>Active Last 7 Days</td><td>${active7}</td></tr>
        <tr><td>Inactive Last 7 Days</td><td>${inactive7}</td></tr>
        <tr><td>Total 30-Day Solves</td><td>${total30}</td></tr>
        <tr><td>Average 30-Day Solves / Student</td><td>${avg30.toFixed(1)}</td></tr>
        <tr><td>Today's Challenge Completed</td><td>${todayCompleted} / ${totalStudents}</td></tr>
        <tr><td>Today's Challenge Completion</td><td>${todayRate.toFixed(1)}%</td></tr>
        <tr><td>Students on Challenge Streak</td><td>${studentsOnStreak}</td></tr>
      </table>

      <h2>Section Summary</h2>
      <table>
        <tr>
          <th>Section</th>
          <th>Students</th>
          <th>Active 7 Days</th>
          <th>30-Day Solves</th>
          <th>Avg / Student</th>
          <th>Challenge Today</th>
          <th>Challenge %</th>
          <th>On Streak</th>
        </tr>
        ${sectionRows.map((row) => `
          <tr>
            <td>${row.section}</td>
            <td>${row.students}</td>
            <td>${row.active7}</td>
            <td>${row.solves30}</td>
            <td>${row.avg30.toFixed(1)}</td>
            <td>${row.todayCompleted} / ${row.students}</td>
            <td>${row.todayRate.toFixed(1)}%</td>
            <td>${row.onStreak}</td>
          </tr>
        `).join("")}
      </table>

      <h2>Top 10 — Selected Scope</h2>
      <table>
        <tr><th>Rank</th><th>Register No</th><th>Student</th><th>Section</th><th>7 Days</th><th>30 Days</th><th>Total</th><th>Status</th></tr>
        ${studentRows(top10)}
      </table>

      <h2>Bottom 10 — Selected Scope</h2>
      <table>
        <tr><th>Position</th><th>Register No</th><th>Student</th><th>Section</th><th>7 Days</th><th>30 Days</th><th>Total</th><th>Status</th></tr>
        ${studentRows(bottom10)}
      </table>

      <h2>Overall Best — Last 7 Days</h2>
      <table>
        <tr><th>Rank</th><th>Register No</th><th>Student</th><th>Section</th><th>7 Days</th><th>30 Days</th><th>Total</th><th>Status</th></tr>
        ${studentRows(best7)}
      </table>

      <h2>Overall Best — Last 30 Days</h2>
      <table>
        <tr><th>Rank</th><th>Register No</th><th>Student</th><th>Section</th><th>7 Days</th><th>30 Days</th><th>Total</th><th>Status</th></tr>
        ${studentRows(best30)}
      </table>
    </body>
    </html>
  `;
}

function downloadFacultyExcelReport() {
  const htmlReport = buildFacultyReportHtml();

  const blob = new Blob(
    ["\uFEFF" + htmlReport],
    {
      type:
        "application/vnd.ms-excel;charset=utf-8"
    }
  );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;
  link.download =
    `Faculty_Analytics_${facultyReportScopeName()}_${facultyReportDate()}.xls`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

function downloadFacultyPdfReport() {
  document.body.classList.add(
    "printing-faculty-report"
  );

  window.print();

  setTimeout(() => {
    document.body.classList.remove(
      "printing-faculty-report"
    );
  }, 500);
}

function openFacultyAnalytics() {
  if (!isAdmin()) {
    return;
  }

  const modal =
    document.getElementById("facultyAnalyticsModal");

  const filter =
    document.getElementById("analyticsSectionFilter");

  if (!modal || !filter) {
    console.error("Faculty Analytics UI elements are missing.");
    return;
  }

  if (
    selectedSection
    && selectedSection !== "OVERALL"
  ) {
    filter.value =
      normalizeSection(selectedSection);
  } else {
    filter.value = "ALL";
  }

  renderFacultyAnalytics();

  modal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeFacultyAnalytics() {
  const modal =
    document.getElementById("facultyAnalyticsModal");

  if (!modal) return;

  modal.hidden = true;

  const anyOpenModal = document.querySelector(
    ".profile-modal:not([hidden]),"
    + ".student-profile-modal:not([hidden]),"
    + ".faculty-analytics-modal:not([hidden]),"
    + ".champions-modal:not([hidden])"
  );

  if (!anyOpenModal) {
    document.body.classList.remove("modal-open");
  }
}

const facultyButton =
  document.getElementById("facultyAnalyticsButton");

const homeFacultyButton =
  document.getElementById("homeFacultyAnalyticsButton");

if (facultyButton) {
  facultyButton.addEventListener(
    "click",
    openFacultyAnalytics
  );
}

const downloadFacultyExcelButton =
  document.getElementById("downloadFacultyExcel");

const downloadFacultyPdfButton =
  document.getElementById("downloadFacultyPdf");

if (downloadFacultyExcelButton) {
  downloadFacultyExcelButton.addEventListener(
    "click",
    downloadFacultyExcelReport
  );
}

if (downloadFacultyPdfButton) {
  downloadFacultyPdfButton.addEventListener(
    "click",
    downloadFacultyPdfReport
  );
}

if (homeFacultyButton) {
  homeFacultyButton.addEventListener(
    "click",
    openFacultyAnalytics
  );
}

const facultyCloseButton =
  document.getElementById("closeFacultyAnalytics");

if (facultyCloseButton) {
  facultyCloseButton.addEventListener(
    "click",
    closeFacultyAnalytics
  );
}

const facultyModalElement =
  document.getElementById("facultyAnalyticsModal");

if (facultyModalElement) {
  facultyModalElement
    .querySelectorAll("[data-close-faculty-analytics]")
    .forEach((element) => {
      element.addEventListener(
        "click",
        closeFacultyAnalytics
      );
    });

  facultyModalElement.addEventListener(
    "click",
    (event) => {
      const profileTarget =
        event.target.closest("[data-analytics-profile]");

      if (!profileTarget) return;

      const registerNumber =
        profileTarget.dataset.analyticsProfile;

      closeFacultyAnalytics();
      openStudentProfile(registerNumber);
    }
  );
}

const facultySectionFilter =
  document.getElementById("analyticsSectionFilter");

if (facultySectionFilter) {
  facultySectionFilter.addEventListener(
    "change",
    renderFacultyAnalytics
  );
}


// ============================================================
// PUBLIC STUDENT PROGRESS PROFILE
// ============================================================

const studentProfileModal = document.getElementById("studentProfileModal");
const closeStudentProfileButton = document.getElementById("closeStudentProfile");

function profileNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatProfileDate(value) {
  if (!value) return "–";

  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString(
    undefined,
    { month: "short", day: "numeric" }
  );
}

async function loadProfileData() {
  if (profileDataLoaded) return;

  const cacheBust = Date.now();

  const [historyResponse, activityResponse] = await Promise.all([
    fetch(`History.csv?time=${cacheBust}`, { cache: "no-store" }),
    fetch(`DailyActivity.csv?time=${cacheBust}`, { cache: "no-store" })
  ]);

  if (historyResponse.ok) {
    historyRows = parseCSV(await historyResponse.text());
  } else {
    historyRows = [];
  }

  if (activityResponse.ok) {
    dailyActivityRows = parseCSV(await activityResponse.text());
  } else {
    dailyActivityRows = [];
  }

  profileDataLoaded = true;
}

function renderDifficultyChart(student) {
  const values = [
    ["Easy", profileNumber(student.Easy)],
    ["Medium", profileNumber(student.Medium)],
    ["Hard", profileNumber(student.Hard)]
  ];

  const maximum = Math.max(1, ...values.map((item) => item[1]));

  document.getElementById("profileDifficultyChart").innerHTML =
    values.map(([label, value]) => {
      const width = Math.max(0, Math.min(100, (value / maximum) * 100));

      return `
        <div class="difficulty-row">
          <div class="difficulty-label">
            <span>${label}</span>
            <strong>${value}</strong>
          </div>

          <div class="difficulty-track">
            <span
              class="difficulty-fill difficulty-${label.toLowerCase()}"
              style="width:${width}%"
            ></span>
          </div>
        </div>
      `;
    }).join("");
}

function renderProgressChart(registerNumber, student) {
  const rows = historyRows
    .filter(
      (row) => String(row["Register Number"]) === String(registerNumber)
    )
    .map((row) => ({
      date: row.Date,
      total: profileNumber(row["Problems Solved"])
    }))
    .filter((row) => row.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  // One point per day. If the current LiveData value is newer, include it.
  const byDate = new Map();

  rows.forEach((row) => {
    byDate.set(String(row.date).slice(0, 10), row.total);
  });

  const updatedDate =
    String(student["Updated At"] || "").slice(0, 10);

  if (updatedDate) {
    byDate.set(
      updatedDate,
      profileNumber(student["Problems Solved"])
    );
  }

  const points = [...byDate.entries()]
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);

  const container = document.getElementById("profileProgressChart");
  const range = document.getElementById("profileHistoryRange");

  if (!points.length) {
    range.textContent = "";
    container.innerHTML = `
      <div class="profile-empty-chart">
        Progress history will appear after tracker snapshots are collected.
      </div>
    `;
    return;
  }

  range.textContent =
    points.length === 1
      ? formatProfileDate(points[0].date)
      : `${formatProfileDate(points[0].date)} – ${formatProfileDate(points[points.length - 1].date)}`;

  if (points.length === 1) {
    container.innerHTML = `
      <div class="single-progress-point">
        <span>${formatProfileDate(points[0].date)}</span>
        <strong>${points[0].total}</strong>
        <small>Total problems solved</small>
      </div>
    `;
    return;
  }

  const width = 760;
  const height = 260;
  const paddingLeft = 48;
  const paddingRight = 22;
  const paddingTop = 24;
  const paddingBottom = 46;

  const totals = points.map((point) => point.total);
  let minValue = Math.min(...totals);
  let maxValue = Math.max(...totals);

  if (minValue === maxValue) {
    minValue = Math.max(0, minValue - 1);
    maxValue += 1;
  }

  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  const xFor = (index) =>
    paddingLeft + (index / (points.length - 1)) * plotWidth;

  const yFor = (value) =>
    paddingTop
    + ((maxValue - value) / (maxValue - minValue)) * plotHeight;

  const polyline = points
    .map((point, index) => `${xFor(index)},${yFor(point.total)}`)
    .join(" ");

  const gridValues = [
    maxValue,
    Math.round((maxValue + minValue) / 2),
    minValue
  ];

  const grid = gridValues.map((value) => {
    const y = yFor(value);

    return `
      <line
        x1="${paddingLeft}"
        y1="${y}"
        x2="${width - paddingRight}"
        y2="${y}"
        class="profile-grid-line"
      />
      <text
        x="${paddingLeft - 10}"
        y="${y + 4}"
        text-anchor="end"
        class="profile-axis-text"
      >${value}</text>
    `;
  }).join("");

  const circles = points.map((point, index) => `
    <circle
      cx="${xFor(index)}"
      cy="${yFor(point.total)}"
      r="5"
      class="profile-line-point"
    >
      <title>${formatProfileDate(point.date)}: ${point.total} solved</title>
    </circle>
  `).join("");

  const labelIndexes = [...new Set([
    0,
    Math.floor((points.length - 1) / 2),
    points.length - 1
  ])];

  const labels = labelIndexes.map((index) => `
    <text
      x="${xFor(index)}"
      y="${height - 14}"
      text-anchor="middle"
      class="profile-axis-text"
    >${formatProfileDate(points[index].date)}</text>
  `).join("");

  container.innerHTML = `
    <svg
      class="profile-progress-svg"
      viewBox="0 0 ${width} ${height}"
      role="img"
      aria-label="Problems solved over time"
    >
      ${grid}

      <polyline
        points="${polyline}"
        class="profile-line-path"
      ></polyline>

      ${circles}
      ${labels}
    </svg>
  `;
}

function renderDailyActivity(registerNumber) {
  const rows = dailyActivityRows
    .filter(
      (row) => String(row["Register Number"]) === String(registerNumber)
    )
    .map((row) => ({
      date: row.Date,
      solved: profileNumber(row["Solved That Day"])
    }))
    .filter((row) => row.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-14);

  const container = document.getElementById("profileDailyActivity");

  if (!rows.length) {
    container.innerHTML = `
      <div class="profile-empty-chart">
        Daily activity will appear as completed-day data is collected.
      </div>
    `;
    return;
  }

  const maximum = Math.max(1, ...rows.map((row) => row.solved));

  container.innerHTML = rows.map((row) => {
    const width =
      row.solved === 0
        ? 0
        : Math.max(7, (row.solved / maximum) * 100);

    return `
      <div class="activity-row">
        <span class="activity-date">${formatProfileDate(row.date)}</span>

        <div class="activity-track">
          <span
            class="activity-fill"
            style="width:${width}%"
          ></span>
        </div>

        <strong>${row.solved}</strong>
      </div>
    `;
  }).join("");
}

async function openStudentProfile(registerNumber) {
  const student = allStudents.find(
    (item) =>
      String(item["Register Number"]) === String(registerNumber)
  );

  if (!student) return;

  studentProfileModal.hidden = false;
  document.body.classList.add("modal-open");

  const initials = String(student["Student Name"] || "S")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  document.getElementById("studentAvatar").textContent = initials || "S";
  document.getElementById("studentProfileName").textContent =
    student["Student Name"] || "Student";
  document.getElementById("profileRegisterNumber").textContent =
    student["Register Number"] || "–";
  document.getElementById("profileUsername").textContent =
    `@${student["LeetCode Username"] || "username"}`;
  document.getElementById("profileSection").textContent =
    student.Section || "ECE";
  document.getElementById("profileStatus").textContent =
    student.Status || "Unknown";

  document.getElementById("profileSectionRank").textContent =
    `#${student["Section Rank"] || "–"}`;
  document.getElementById("profileOverallRank").textContent =
    `#${student["Overall Rank"] || "–"}`;

  document.getElementById("profileTotalSolved").textContent =
    student["Problems Solved"] || "0";
  document.getElementById("profile30Days").textContent =
    student["Last 30 Days"] || "0";
  document.getElementById("profile7Days").textContent =
    student["Last 7 Days"] || "0";
  document.getElementById("profileToday").textContent =
    student["Solved Today"] || "0";

  document.getElementById("profileLastProblem").textContent =
    student["Last Problem"] || "–";
  document.getElementById("profileLastSolved").textContent =
    student["Last Solved"] || "–";

  const challengeStats =
    studentChallengeStats(
      student["Register Number"]
    );

  const todayChallenge =
    getTodayChallenge();

  const completedToday =
    todayChallenge
    && dailyChallengeResults.some(
      (result) =>
        Number(result.challenge_id)
        === Number(todayChallenge.id)
        && String(result.register_number)
        === String(student["Register Number"])
        && result.completed
    );

  document.getElementById(
    "profileChallengeCompleted"
  ).textContent =
    challengeStats.totalCompleted;

  document.getElementById(
    "profileChallengeCurrentStreak"
  ).textContent =
    `🔥 ${challengeStats.currentStreak}`;

  document.getElementById(
    "profileChallengeLongestStreak"
  ).textContent =
    `🏆 ${challengeStats.longestStreak}`;

  document.getElementById(
    "profileChallengeRate"
  ).textContent =
    `${challengeStats.completionRate.toFixed(1)}%`;

  document.getElementById(
    "profileChallengeTodayBadge"
  ).textContent =
    todayChallenge
      ? (
          completedToday
            ? "Today: ✅ Completed"
            : "Today: ❌ Pending"
        )
      : "Today: No Challenge";

  renderStudentCodingProfile(
    student["Register Number"]
  );

  const leetCodeLink = document.getElementById("profileLeetCodeLink");
  leetCodeLink.href =
    student["LeetCode Link"]
    || `https://leetcode.com/u/${encodeURIComponent(student["LeetCode Username"] || "")}/`;

  renderDifficultyChart(student);

  document.getElementById("profileProgressChart").innerHTML =
    `<div class="profile-empty-chart">Loading progress...</div>`;

  document.getElementById("profileDailyActivity").innerHTML =
    `<div class="profile-empty-chart">Loading activity...</div>`;

  try {
    await loadProfileData();
    renderProgressChart(registerNumber, student);
    renderDailyActivity(registerNumber);
  } catch (error) {
    console.error(error);

    document.getElementById("profileProgressChart").innerHTML =
      `<div class="profile-empty-chart">Unable to load History.csv.</div>`;

    document.getElementById("profileDailyActivity").innerHTML =
      `<div class="profile-empty-chart">Unable to load DailyActivity.csv.</div>`;
  }
}

function closeStudentProfile() {
  studentProfileModal.hidden = true;

  // Keep scrolling locked only if another modal is still open.
  const anotherModalOpen = [
    adminLoginModal,
    profileModal,
    manageStudentsModal,
    deleteModal
  ].some((modal) => modal && !modal.hidden);

  if (!anotherModalOpen) {
    document.body.classList.remove("modal-open");
  }
}

tableBody.addEventListener("click", (event) => {
  const profileButton = event.target.closest("[data-profile-register]");

  if (!profileButton) return;

  openStudentProfile(profileButton.dataset.profileRegister);
});

closeStudentProfileButton.addEventListener("click", closeStudentProfile);

studentProfileModal
  .querySelectorAll("[data-close-student-profile]")
  .forEach((element) =>
    element.addEventListener("click", closeStudentProfile)
  );



async function loadCodingAnalyticsData() {
  if (!supabaseClient) return;

  try {
    const [
      { data: tests, error: testsError },
      { data: attempts, error: attemptsError }
    ] = await Promise.all([
      supabaseClient
        .from("coding_tests")
        .select("*")
        .order("starts_at", { ascending: false }),

      supabaseClient
        .from("coding_attempts")
        .select("*")
        .order("started_at", { ascending: false })
    ]);

    if (testsError) throw testsError;
    if (attemptsError) throw attemptsError;

    codingTests = tests || [];
    codingAttempts = attempts || [];
    codingAnalyticsLoaded = true;

    renderSectionCodingStats();
    renderCodingTestHomeStatus();

    const facultyModal = document.getElementById("facultyAnalyticsModal");
    if (facultyModal && !facultyModal.hidden) {
      renderFacultyAnalytics();
    }
  } catch (error) {
    console.error("Coding analytics load failed:", error);
  }
}

function getCodingTestById(testId) {
  return codingTests.find(
    (test) => String(test.id) === String(testId)
  ) || null;
}

function getLatestCodingTest() {
  return [...codingTests]
    .filter(
      (test) =>
        test.status === "published"
        || test.status === "closed"
    )
    .sort(
      (a, b) =>
        new Date(b.starts_at || 0)
        - new Date(a.starts_at || 0)
    )[0] || null;
}

function codingAttemptPercent(attempt) {
  const test = getCodingTestById(attempt.test_id);
  const totalMarks = Number(test?.total_marks || 0);

  if (totalMarks <= 0) return 0;

  return Math.max(
    0,
    Math.min(
      100,
      Number(attempt.total_score || 0) / totalMarks * 100
    )
  );
}

function finalizedCodingAttempts(registerNumber) {
  return codingAttempts
    .filter(
      (attempt) =>
        String(attempt.register_number) === String(registerNumber)
        && (
          attempt.status === "submitted"
          || attempt.status === "expired"
        )
    )
    .sort(
      (a, b) =>
        new Date(b.submitted_at || b.started_at || 0)
        - new Date(a.submitted_at || a.started_at || 0)
    );
}

function studentCodingStats(registerNumber) {
  const attempts = finalizedCodingAttempts(registerNumber);
  const percentages = attempts.map(codingAttemptPercent);

  const passed = attempts.filter(
    (attempt) => attempt.result_status === "passed"
  ).length;

  const averageScore =
    percentages.length
      ? percentages.reduce((sum, value) => sum + value, 0)
        / percentages.length
      : 0;

  const bestScore =
    percentages.length
      ? Math.max(...percentages)
      : 0;

  const passedCases = attempts.reduce(
    (sum, attempt) => sum + Number(attempt.passed_cases || 0),
    0
  );

  const totalCases = attempts.reduce(
    (sum, attempt) => sum + Number(attempt.total_cases || 0),
    0
  );

  let currentStreak = 0;
  for (const attempt of attempts) {
    if (attempt.result_status === "passed") {
      currentStreak += 1;
    } else {
      break;
    }
  }

  return {
    attended: attempts.length,
    passed,
    averageScore,
    bestScore,
    passedCases,
    totalCases,
    currentStreak,
    latest: attempts[0] || null
  };
}

function latestTestStatsForStudents(students) {
  const latestTest = getLatestCodingTest();

  if (!latestTest) {
    return {
      test: null,
      students: students.length,
      attended: 0,
      passed: 0,
      attendanceRate: 0,
      passRate: 0,
      averageScore: 0,
      violations: 0
    };
  }

  const registers = new Set(
    students.map(
      (student) => String(student["Register Number"])
    )
  );

  const attempts = codingAttempts.filter(
    (attempt) =>
      String(attempt.test_id) === String(latestTest.id)
      && registers.has(String(attempt.register_number))
      && (
        attempt.status === "submitted"
        || attempt.status === "expired"
      )
  );

  const attended = attempts.length;
  const passed = attempts.filter(
    (attempt) => attempt.result_status === "passed"
  ).length;

  const averageScore =
    attended
      ? attempts.reduce(
          (sum, attempt) => sum + codingAttemptPercent(attempt),
          0
        ) / attended
      : 0;

  const violations = attempts.reduce(
    (sum, attempt) => sum + Number(attempt.violation_count || 0),
    0
  );

  return {
    test: latestTest,
    students: students.length,
    attended,
    passed,
    attendanceRate:
      students.length ? attended / students.length * 100 : 0,
    passRate:
      attended ? passed / attended * 100 : 0,
    averageScore,
    violations
  };
}

function renderSectionCodingStats() {
  SECTION_NAMES.forEach((section) => {
    const key = section.replace(/\s+/g, "");
    const element = document.getElementById(`codingPassed${key}`);
    if (!element) return;

    const students = allStudents.filter(
      (student) =>
        normalizeSection(student.Section)
        === normalizeSection(section)
    );

    const stats = latestTestStatsForStudents(students);
    element.textContent = `${stats.passed}/${students.length}`;
  });

  const overall = document.getElementById("codingPassedOverall");
  if (overall) {
    const stats = latestTestStatsForStudents(allStudents);
    overall.textContent = `${stats.passed}/${allStudents.length}`;
  }
}

function renderCodingTestHomeStatus() {
  const element = document.getElementById("codingTestHomeStatus");
  if (!element) return;

  const latestTest = getLatestCodingTest();
  if (!latestTest) {
    element.textContent = "No coding test published yet.";
    return;
  }

  const stats = latestTestStatsForStudents(allStudents);
  element.textContent =
    `${latestTest.title} · ${stats.passed}/${allStudents.length} passed`;
}

function renderStudentCodingProfile(registerNumber) {
  const stats = studentCodingStats(registerNumber);

  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };

  setText("profileCodingAttended", stats.attended);
  setText("profileCodingPassed", stats.passed);
  setText("profileCodingAverage", `${stats.averageScore.toFixed(1)}%`);
  setText("profileCodingBest", `${stats.bestScore.toFixed(1)}%`);
  setText("profileCodingStreak", `🔥 ${stats.currentStreak}`);
  setText("profileCodingCases", `${stats.passedCases} / ${stats.totalCases}`);

  const lastResult = document.getElementById("profileCodingLastResult");
  if (lastResult) {
    if (!stats.latest) {
      lastResult.textContent = "No test result";
    } else {
      const percent = codingAttemptPercent(stats.latest);
      lastResult.textContent =
        stats.latest.result_status === "passed"
          ? `✅ Last: ${percent.toFixed(1)}%`
          : `❌ Last: ${percent.toFixed(1)}%`;
    }
  }
}

function renderFacultyCodingAnalytics(students) {
  const stats = latestTestStatsForStudents(students);

  const pairs = [
    ["analyticsCodingAttendance", `${stats.attendanceRate.toFixed(1)}%`],
    ["analyticsCodingAttendanceCount", `${stats.attended} / ${stats.students} attended`],
    ["analyticsCodingPassRate", `${stats.passRate.toFixed(1)}%`],
    ["analyticsCodingPassCount", `${stats.passed} / ${stats.attended} passed`],
    ["analyticsCodingAverage", `${stats.averageScore.toFixed(1)}%`],
    ["analyticsCodingViolations", stats.violations]
  ];

  pairs.forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  });

  const latestName = document.getElementById("analyticsCodingLatestTestName");
  if (latestName) {
    latestName.textContent =
      stats.test ? stats.test.title : "No coding test data yet.";
  }

  const body = document.getElementById("analyticsCodingSectionSummary");
  if (!body) return;

  body.innerHTML = SECTION_NAMES.map((section) => {
    const sectionStudents = allStudents.filter(
      (student) =>
        normalizeSection(student.Section)
        === normalizeSection(section)
    );

    const sectionStats = latestTestStatsForStudents(sectionStudents);

    return `
      <tr>
        <td><strong>${escapeHTML(section)}</strong></td>
        <td>${sectionStudents.length}</td>
        <td>${sectionStats.attended}</td>
        <td>${sectionStats.passed}</td>
        <td>${sectionStats.passRate.toFixed(1)}%</td>
        <td>${sectionStats.averageScore.toFixed(1)}%</td>
        <td>${sectionStats.violations}</td>
      </tr>
    `;
  }).join("");
}

async function initialize() {
  createClient();
  await loadData();
  await restoreAdminSession();
  await loadDailyChallengeData();
  await loadCodingAnalyticsData();
  updateAdminUI();
}


document.querySelectorAll("[data-section]").forEach((button) => {
  button.addEventListener("click", () => {
    openSection(button.dataset.section);
  });
});

backToSectionsButton.addEventListener("click", showSectionHome);

searchInput.addEventListener("input", applySearch);

document
  .getElementById("downloadCsvButton")
  .addEventListener("click", downloadCSV);

document
  .getElementById("downloadPdfButton")
  .addEventListener("click", downloadPDF);

adminLoginButton.addEventListener("click", openAdminLogin);
adminLoginForm.addEventListener("submit", handleAdminLogin);

adminLogoutButton.addEventListener("click", adminLogout);
homeAdminLogoutButton.addEventListener("click", adminLogout);

closeAdminLogin.addEventListener("click", closeAdminLoginModal);

adminLoginModal
  .querySelectorAll("[data-close-admin-login]")
  .forEach((element) =>
    element.addEventListener("click", closeAdminLoginModal)
  );

toggleAdminPassword.addEventListener("click", () => {
  const showing = adminPassword.type === "text";
  adminPassword.type = showing ? "password" : "text";
  toggleAdminPassword.textContent = showing ? "Show" : "Hide";
});

addProfileButton.addEventListener("click", openAddModal);
homeAddProfileButton.addEventListener("click", openAddModal);

syncNowButton.addEventListener("click", triggerLeetCodeSync);
homeSyncNowButton.addEventListener("click", triggerLeetCodeSync);

manageStudentsButton.addEventListener("click", openManageStudents);
homeManageStudentsButton.addEventListener("click", openManageStudents);

closeManageStudents.addEventListener("click", closeManageStudentsModal);

manageStudentsModal
  .querySelectorAll("[data-close-manage]")
  .forEach((element) =>
    element.addEventListener("click", closeManageStudentsModal)
  );

manageSearch.addEventListener("input", renderManageStudents);
manageSectionFilter.addEventListener("change", renderManageStudents);

manageStudentsBody.addEventListener("click", (event) => {
  const editButton =
    event.target.closest("[data-manage-edit]");

  if (editButton) {
    openEditModal(editButton.dataset.manageEdit);
    return;
  }

  const deleteButton =
    event.target.closest("[data-manage-delete]");

  if (deleteButton) {
    openDeleteModal(deleteButton.dataset.manageDelete);
  }
});

closeProfileModal.addEventListener("click", closeProfile);

profileModal
  .querySelectorAll("[data-close-profile]")
  .forEach((element) =>
    element.addEventListener("click", closeProfile)
  );

profileForm.addEventListener("submit", saveProfile);

usernameInput.addEventListener("input", () => {
  generatedLink.textContent =
    `https://leetcode.com/u/${usernameInput.value.trim() || "username"}/`;
});

cancelDeleteButton.addEventListener("click", closeDelete);

deleteModal
  .querySelectorAll("[data-close-delete]")
  .forEach((element) =>
    element.addEventListener("click", closeDelete)
  );

confirmDeleteButton.addEventListener("click", confirmDelete);

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;

  adminLoginModal.hidden = true;
  profileModal.hidden = true;
  manageStudentsModal.hidden = true;
  deleteModal.hidden = true;
  const studentProfile =
    document.getElementById("studentProfileModal");

  const facultyModal =
    document.getElementById("facultyAnalyticsModal");

  const champions =
    document.getElementById("championsModal");

  if (studentProfile) studentProfile.hidden = true;
  if (facultyModal) facultyModal.hidden = true;
  if (champions) champions.hidden = true;

  document.body.classList.remove("modal-open");
});

initialize();

setInterval(() => {
  if (!document.hidden) {
    loadData().catch(console.error);
    loadCodingAnalyticsData().catch(console.error);
  }
}, 30000);



// ============================================================
// DAILY CODING TEST PLATFORM — STABLE FINAL
// ============================================================

const codingState = {
  test: null,
  questions: [],
  attempt: null,
  currentIndex: 0,
  codeByQuestion: {},
  timerId: null,
  violations: 0,
  submitted: false,
  guardInstalled: false
};

const codingAdminState = {
  test: null,
  question: null
};

function codingEl(id) {
  return document.getElementById(id);
}

function codingNowIso() {
  return new Date().toISOString();
}

function runnerBaseUrl() {
  return String(
    window.APP_CONFIG?.CODE_RUNNER_URL || ""
  ).replace(/\/+$/, "");
}

function codingMessage(elementId, text, type = "") {
  const element = codingEl(elementId);

  if (!element) {
    return;
  }

  element.textContent = text;
  element.className =
    `form-message ${type}`.trim();
}

function codingScrollTo(elementId) {
  codingEl(elementId)?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}


async function ensureJavaRunnerReady() {
  const baseUrl = runnerBaseUrl();

  if (!baseUrl) {
    throw new Error(
      "Java compiler URL is not configured."
    );
  }

  let response;

  try {
    response = await fetch(
      `${baseUrl}/health`,
      { cache: "no-store" }
    );
  } catch {
    throw new Error(
      "Java compiler is offline. Start the code runner before the test."
    );
  }

  if (!response.ok) {
    throw new Error(
      `Java compiler health check failed (${response.status}).`
    );
  }

  const health = await response.json();

  if (!health.ok || String(health.jdk) !== "21") {
    throw new Error(
      "Java 21 compiler is not ready."
    );
  }

  return health;
}

async function verifyCodingStudent(registerNumber) {
  // Uses a security-definer RPC created by coding_test_repair.sql.
  // This avoids exposing the full students table to anonymous users.
  const { data, error } = await supabaseClient.rpc(
    "verify_coding_student",
    {
      p_register_number: String(registerNumber).trim()
    }
  );

  if (error) {
    throw new Error(
      `Student verification failed: ${error.message}`
    );
  }

  const row = Array.isArray(data)
    ? data[0]
    : data;

  if (!row) {
    throw new Error(
      "Register number not found in the students table."
    );
  }

  return row;
}

async function loadActiveCodingTest() {
  const now = codingNowIso();

  const { data, error } = await supabaseClient
    .from("coding_tests")
    .select("*")
    .eq("status", "published")
    .lte("starts_at", now)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function loadCodingQuestions(testId) {
  const { data, error } = await supabaseClient
    .from("coding_questions")
    .select("*")
    .eq("test_id", testId)
    .order("question_number", {
      ascending: true
    });

  if (error) {
    throw error;
  }

  return data || [];
}

async function openCodingTest() {
  const modal = codingEl("codingTestModal");

  if (!modal) {
    return;
  }

  modal.hidden = false;
  codingEl("codingTestWorkspace").hidden = true;
  codingEl("codingTestLobby").hidden = false;
  codingMessage("codingLobbyMessage", "");

  try {
    codingState.test =
      await loadActiveCodingTest();

    if (!codingState.test) {
      codingEl("codingLobbyTitle").textContent =
        "No active coding test";

      codingEl("codingLobbyMeta").textContent =
        "There is no published test in the current time window.";

      codingEl("startCodingTestButton").disabled =
        true;

      return;
    }

    codingEl("startCodingTestButton").disabled =
      false;

    codingEl("codingLobbyTitle").textContent =
      codingState.test.title;

    codingEl("codingLobbyMeta").textContent =
      `${codingState.test.duration_minutes} minutes · `
      + `${codingState.test.total_marks || 0} marks`;

    codingEl("codingTestTitle").textContent =
      codingState.test.title;
  } catch (error) {
    codingMessage(
      "codingLobbyMessage",
      error.message,
      "error"
    );
  }
}

function closeCodingTest() {
  if (
    codingState.attempt
    && !codingState.submitted
    && !codingEl("codingTestWorkspace").hidden
  ) {
    codingMessage(
      "codingLobbyMessage",
      "Test is in progress. Submit the test before closing.",
      "error"
    );
    return;
  }

  codingEl("codingTestModal").hidden = true;
}

async function startCodingTest() {
  const registerNumber =
    codingEl("codingRegisterNumber").value.trim();

  if (!registerNumber) {
    codingMessage(
      "codingLobbyMessage",
      "Enter your register number.",
      "error"
    );
    return;
  }

  codingMessage(
    "codingLobbyMessage",
    "Verifying student..."
  );

  try {
    codingMessage(
      "codingLobbyMessage",
      "Checking Java 21 compiler..."
    );

    await ensureJavaRunnerReady();

    codingMessage(
      "codingLobbyMessage",
      "Verifying student..."
    );

    await verifyCodingStudent(registerNumber);

    const { data: existing, error: existingError } =
      await supabaseClient
        .from("coding_attempts")
        .select("*")
        .eq("test_id", codingState.test.id)
        .eq("register_number", registerNumber)
        .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (
      existing
      && (
        existing.status === "submitted"
        || existing.status === "expired"
        || existing.result_status === "passed"
        || existing.result_status === "failed"
      )
    ) {
      throw new Error(
        "You have already completed this test. Only one attempt is allowed."
      );
    }

    if (existing) {
      // Resume the same unfinished attempt. Never create a second attempt.
      codingState.attempt = existing;
    } else {
      const startedAt = new Date();

      const expiresAt = new Date(
        startedAt.getTime()
        + Number(
          codingState.test.duration_minutes
        ) * 60_000
      );

      const { data, error } =
        await supabaseClient
          .from("coding_attempts")
          .insert({
            test_id:
              codingState.test.id,
            register_number:
              registerNumber,
            started_at:
              startedAt.toISOString(),
            expires_at:
              expiresAt.toISOString(),
            status:
              "in_progress"
          })
          .select()
          .single();

      if (error) {
        throw error;
      }

      codingState.attempt = data;
    }

    codingState.questions =
      await loadCodingQuestions(
        codingState.test.id
      );

    if (!codingState.questions.length) {
      throw new Error(
        "This test has no questions. Contact faculty."
      );
    }

    const {
      data: drafts,
      error: draftError
    } = await supabaseClient
      .from("coding_submissions")
      .select("*")
      .eq(
        "attempt_id",
        codingState.attempt.id
      );

    if (draftError) {
      throw draftError;
    }

    codingState.codeByQuestion = {};

    (drafts || []).forEach(
      (submission) => {
        codingState.codeByQuestion[
          submission.question_id
        ] = submission.source_code || "";
      }
    );

    codingState.currentIndex = 0;
    codingState.submitted = false;
    codingState.violations =
      Number(
        codingState.attempt.violation_count || 0
      );

    codingEl(
      "codingViolationBadge"
    ).textContent =
      `Violations: ${codingState.violations}`;

    codingEl("codingTestLobby").hidden = true;
    codingEl("codingTestWorkspace").hidden =
      false;

    const endButton = codingEl("codingEndTestButton");
    if (endButton) {
      endButton.disabled = false;
      endButton.textContent = "End Test";
    }

    await enterCodingFullscreen();

    renderCodingQuestion();
    startCodingTimer();
    installCodingGuard();
  } catch (error) {
    codingMessage(
      "codingLobbyMessage",
      error.message,
      "error"
    );
  }
}

function renderCodingQuestion() {
  const question =
    codingState.questions[
      codingState.currentIndex
    ];

  if (!question) {
    return;
  }

  codingEl(
    "codingQuestionCounter"
  ).textContent =
    `${codingState.currentIndex + 1} / `
    + `${codingState.questions.length}`;

  codingEl(
    "codingQuestionTitle"
  ).textContent =
    question.title;

  codingEl(
    "codingQuestionDifficulty"
  ).textContent =
    question.difficulty;

  codingEl(
    "codingQuestionMarks"
  ).textContent =
    `${question.marks} Marks`;

  codingEl(
    "codingQuestionDescription"
  ).textContent =
    question.description;

  codingEl(
    "codingSampleInput"
  ).textContent =
    question.sample_input || "(none)";

  codingEl(
    "codingSampleOutput"
  ).textContent =
    question.sample_output || "(none)";

  codingEl(
    "codingSourceEditor"
  ).value =
    codingState.codeByQuestion[
      question.id
    ]
    ?? question.starter_code
    ?? "";

  codingEl(
    "codingCaseResults"
  ).innerHTML = "";

  codingEl(
    "codingExecutionState"
  ).textContent = "Ready";

  codingEl(
    "codingConsoleOutput"
  ).textContent =
    "Press Run Code to compile and execute.";
}

async function saveCodingDraft() {
  const question =
    codingState.questions[
      codingState.currentIndex
    ];

  if (
    !question
    || !codingState.attempt
  ) {
    return;
  }

  const sourceCode =
    codingEl("codingSourceEditor").value;

  codingState.codeByQuestion[
    question.id
  ] = sourceCode;

  const { error } = await supabaseClient
    .from("coding_submissions")
    .upsert(
      {
        attempt_id:
          codingState.attempt.id,
        question_id:
          question.id,
        source_code:
          sourceCode,
        language:
          "java",
        status:
          "draft",
        updated_at:
          codingNowIso()
      },
      {
        onConflict:
          "attempt_id,question_id"
      }
    );

  if (error) {
    throw error;
  }
}

async function callRunner(
  endpoint,
  payload
) {
  const baseUrl =
    runnerBaseUrl();

  if (!baseUrl) {
    throw new Error(
      "Java runner URL is not configured in config.js."
    );
  }

  let response;

  try {
    response = await fetch(
      `${baseUrl}${endpoint}`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body:
          JSON.stringify(payload)
      }
    );
  } catch (error) {
    throw new Error(
      "Cannot reach Java runner. "
      + "Make sure Docker is running and "
      + `${baseUrl}/health works.`
    );
  }

  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error(
      `Runner returned HTTP ${response.status}.`
    );
  }

  if (!response.ok) {
    throw new Error(
      result.detail
      || result.message
      || `Runner error ${response.status}`
    );
  }

  return result;
}

async function codingRun(mode = "run") {
  const question =
    codingState.questions[
      codingState.currentIndex
    ];

  if (!question) {
    return;
  }

  try {
    await saveCodingDraft();

    codingEl(
      "codingExecutionState"
    ).textContent =
      "Compiling...";

    codingEl(
      "codingConsoleOutput"
    ).textContent =
      "Compiling with Java 21...";

    codingEl(
      "codingCaseResults"
    ).innerHTML = "";

    const sourceCode =
      codingEl(
        "codingSourceEditor"
      ).value;

    let result;

    if (mode === "samples") {
      result = await callRunner(
        "/judge",
        {
          source_code:
            sourceCode,
          test_cases: [
            {
              input:
                question.sample_input || "",
              expected_output:
                question.sample_output || "",
              hidden:
                false,
              marks:
                0
            }
          ]
        }
      );
    } else {
      result = await callRunner(
        "/run",
        {
          source_code:
            sourceCode,
          stdin:
            question.sample_input || ""
        }
      );
    }

    codingEl(
      "codingExecutionState"
    ).textContent =
      result.status || "Done";

    const compilerText =
      result.compile_error
      || result.stderr
      || result.stdout
      || "(no output)";

    codingEl(
      "codingConsoleOutput"
    ).textContent =
      compilerText;

    if (
      Array.isArray(result.results)
    ) {
      codingEl(
        "codingCaseResults"
      ).innerHTML =
        result.results.map(
          (item, index) => `
            <div class="${
              item.passed
                ? "coding-case-pass"
                : "coding-case-fail"
            }">
              ${
                item.passed
                  ? "✅"
                  : "❌"
              }
              Case ${index + 1}:
              ${
                item.passed
                  ? "Passed"
                  : `Failed · Expected: ${
                      escapeHTML(
                        item.expected
                      )
                    } · Output: ${
                      escapeHTML(
                        item.output
                      )
                    }`
              }
            </div>
          `
        ).join("");
    }
  } catch (error) {
    codingEl(
      "codingExecutionState"
    ).textContent =
      "Error";

    codingEl(
      "codingConsoleOutput"
    ).textContent =
      error.message;
  }
}

async function submitCodingTest(
  autoSubmit = false
) {
  if (
    codingState.submitted
    || !codingState.attempt
  ) {
    return;
  }

  codingState.submitted = true;

  try {
    await saveCodingDraft();

    let totalScore = 0;
    let passedCases = 0;
    let totalCases = 0;

    for (const question of codingState.questions) {
      const sourceCode =
        codingState.codeByQuestion[question.id]
        ?? question.starter_code
        ?? "";

      const result = await callRunner(
        "/judge-question",
        {
          question_id: question.id,
          source_code: sourceCode
        }
      );

      const score = Number(result.score || 0);
      const passed = Number(result.passed || 0);
      const questionCases = Number(result.total || 0);

      totalScore += score;
      passedCases += passed;
      totalCases += questionCases;

      const { error } = await supabaseClient
        .from("coding_submissions")
        .upsert(
          {
            attempt_id: codingState.attempt.id,
            question_id: question.id,
            source_code: sourceCode,
            language: "java",
            passed_cases: passed,
            total_cases: questionCases,
            score,
            status: "submitted",
            submitted_at: codingNowIso(),
            updated_at: codingNowIso()
          },
          {
            onConflict: "attempt_id,question_id"
          }
        );

      if (error) {
        throw error;
      }
    }

    const allCasesPassed =
      totalCases > 0
      && passedCases === totalCases;

    const resultStatus =
      allCasesPassed
        ? "passed"
        : "failed";

    const testTotalMarks =
      Number(codingState.test?.total_marks || 0);

    const startedAt =
      new Date(codingState.attempt.started_at).getTime();

    const submittedAt = Date.now();

    const timeTakenSeconds =
      Math.max(
        0,
        Math.round((submittedAt - startedAt) / 1000)
      );

    const { error: attemptError } = await supabaseClient
      .from("coding_attempts")
      .update({
        status: autoSubmit ? "expired" : "submitted",
        submitted_at: new Date(submittedAt).toISOString(),
        total_score: totalScore,
        violation_count: codingState.violations,
        passed_cases: passedCases,
        total_cases: totalCases,
        result_status: resultStatus,
        time_taken_seconds: timeTakenSeconds
      })
      .eq("id", codingState.attempt.id);

    if (attemptError) {
      throw attemptError;
    }

    clearInterval(codingState.timerId);

    [
      "codingEndTestButton",
      "codingRunButton",
      "codingRunTestsButton",
      "codingSourceEditor"
    ].forEach((id) => {
      const element = codingEl(id);
      if (element) element.disabled = true;
    });

    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    }

    await loadCodingAnalyticsData();

    showCodingResult({
      passed: allCasesPassed,
      autoSubmit,
      score: totalScore,
      totalMarks: testTotalMarks,
      passedCases,
      totalCases,
      timeTakenSeconds,
      violations: codingState.violations
    });
  } catch (error) {
    codingState.submitted = false;

    codingEl("codingConsoleOutput").textContent =
      `Submission error: ${error.message}`;
  }
}


function formatCodingDuration(seconds) {
  const total = Number(seconds || 0);
  const minutes = Math.floor(total / 60);
  const remaining = total % 60;
  return `${minutes}m ${remaining}s`;
}

function returnFromCodingResult() {
  const resultModal =
    document.getElementById("codingResultModal");

  const testModal =
    document.getElementById("codingTestModal");

  if (resultModal) resultModal.hidden = true;
  if (testModal) testModal.hidden = true;

  codingState.attempt = null;
  codingState.questions = [];
  codingState.codeByQuestion = {};
  codingState.submitted = false;

  showSectionHome();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function showCodingResult(result) {
  const modal =
    document.getElementById("codingResultModal");

  if (!modal) {
    returnFromCodingResult();
    return;
  }

  modal.hidden = false;

  const passed = Boolean(result.passed);

  document.getElementById("codingResultIcon").textContent =
    passed ? "🎉" : "❌";

  document.getElementById("codingResultTitle").textContent =
    passed
      ? "Congratulations!"
      : "Test Completed";

  document.getElementById("codingResultMessage").textContent =
    passed
      ? "All test cases passed successfully."
      : "Not all test cases passed.";

  document.getElementById("codingResultStatus").textContent =
    passed
      ? "ALL TEST CASES PASSED"
      : "NOT ALL TEST CASES PASSED";

  document.getElementById("codingResultCases").textContent =
    `${Number(result.passedCases || 0)} / ${Number(result.totalCases || 0)} test cases passed`;

  document.getElementById("codingResultRedirect").textContent =
    "Returning to the ECE leaderboard in 5 seconds...";

  setTimeout(
    returnFromCodingResult,
    5000
  );
}

async function endCodingTestWithConfirmation() {
  if (
    !codingState.attempt
    || codingState.submitted
  ) {
    return;
  }

  const firstCheck = window.confirm(
    "Are you sure you want to end the test? Once ended, you cannot attend this test again."
  );

  if (!firstCheck) {
    return;
  }

  const secondCheck = window.confirm(
    "Final confirmation: End the test now? This is your only attempt."
  );

  if (!secondCheck) {
    return;
  }

  const button = codingEl("codingEndTestButton");

  if (button) {
    button.disabled = true;
    button.textContent = "Ending Test...";
  }

  await submitCodingTest(false);
}

function startCodingTimer() {
  clearInterval(
    codingState.timerId
  );

  const updateTimer = () => {
    const remaining =
      new Date(
        codingState.attempt.expires_at
      ).getTime()
      - Date.now();

    if (remaining <= 0) {
      codingEl(
        "codingTestTimer"
      ).textContent =
        "00:00:00";

      clearInterval(
        codingState.timerId
      );

      submitCodingTest(true);
      return;
    }

    const seconds =
      Math.floor(
        remaining / 1000
      );

    const hours =
      Math.floor(
        seconds / 3600
      );

    const minutes =
      Math.floor(
        (seconds % 3600) / 60
      );

    const remainingSeconds =
      seconds % 60;

    codingEl(
      "codingTestTimer"
    ).textContent =
      [
        hours,
        minutes,
        remainingSeconds
      ]
        .map(
          (value) =>
            String(value)
              .padStart(2, "0")
        )
        .join(":");
  };

  updateTimer();

  codingState.timerId =
    setInterval(
      updateTimer,
      1000
    );
}

async function logCodingViolation(
  violationType
) {
  if (
    !codingState.attempt
    || codingState.submitted
  ) {
    return;
  }

  codingState.violations += 1;

  codingEl(
    "codingViolationBadge"
  ).textContent =
    `Violations: ${codingState.violations}`;

  await supabaseClient
    .from("coding_violations")
    .insert({
      attempt_id:
        codingState.attempt.id,
      violation_type:
        violationType
    });

  await supabaseClient
    .from("coding_attempts")
    .update({
      violation_count:
        codingState.violations
    })
    .eq(
      "id",
      codingState.attempt.id
    );
}

function installCodingGuard() {
  if (
    codingState.guardInstalled
  ) {
    return;
  }

  codingState.guardInstalled =
    true;

  const editor =
    codingEl("codingSourceEditor");

  [
    "copy",
    "paste",
    "cut",
    "contextmenu",
    "drop"
  ].forEach(
    (eventType) => {
      editor.addEventListener(
        eventType,
        (event) => {
          event.preventDefault();

          logCodingViolation(
            eventType
          );
        }
      );
    }
  );
}

async function enterCodingFullscreen() {
  try {
    if (
      !document.fullscreenElement
    ) {
      await document
        .documentElement
        .requestFullscreen();
    }
  } catch {
    // Browser may reject fullscreen.
  }
}

document.addEventListener(
  "visibilitychange",
  () => {
    if (
      codingState.attempt
      && !codingState.submitted
      && document.hidden
    ) {
      logCodingViolation(
        "tab_switch"
      );
    }
  }
);

document.addEventListener(
  "fullscreenchange",
  () => {
    if (
      codingState.attempt
      && !codingState.submitted
      && !document.fullscreenElement
    ) {
      logCodingViolation(
        "fullscreen_exit"
      );
    }
  }
);

// ============================================================
// ADMIN — SIMPLE SEQUENTIAL TEST MANAGER
// ============================================================

function resetCodingAdminQuestionForm() {
  codingEl(
    "codingAdminQuestionTitle"
  ).value = "";

  codingEl(
    "codingAdminDescription"
  ).value = "";

  codingEl(
    "codingAdminDifficulty"
  ).value = "Easy";

  codingEl(
    "codingAdminMarks"
  ).value = "20";

  codingEl(
    "codingAdminTimeLimit"
  ).value = "3000";

  codingEl(
    "codingAdminSampleInput"
  ).value = "";

  codingEl(
    "codingAdminSampleOutput"
  ).value = "";

  codingMessage(
    "codingQuestionAdminMessage",
    ""
  );
}

function resetCodingAdminCaseForm() {
  codingEl(
    "codingAdminCaseInput"
  ).value = "";

  codingEl(
    "codingAdminCaseOutput"
  ).value = "";

  codingEl(
    "codingAdminCaseMarks"
  ).value = "5";

  codingEl(
    "codingAdminCaseHidden"
  ).checked = true;

  codingMessage(
    "codingCaseAdminMessage",
    ""
  );
}

function refreshCodingAdminLocks() {
  const questionSection =
    codingEl("codingQuestionSection");

  const caseSection =
    codingEl("codingCaseSection");

  const selectedTest =
    codingAdminState.test;

  const selectedQuestion =
    codingAdminState.question;

  questionSection.classList.toggle(
    "coding-section-locked",
    !selectedTest
  );

  codingEl(
    "codingQuestionAdminForm"
  ).inert =
    !selectedTest;

  codingEl(
    "codingSelectedTestBadge"
  ).textContent =
    selectedTest
      ? `Selected: ${selectedTest.title}`
      : "No test selected";

  codingEl(
    "codingQuestionLockMessage"
  ).hidden =
    Boolean(selectedTest);

  caseSection.classList.toggle(
    "coding-section-locked",
    !selectedQuestion
  );

  codingEl(
    "codingCaseAdminForm"
  ).inert =
    !selectedQuestion;

  codingEl(
    "codingSelectedQuestionBadge"
  ).textContent =
    selectedQuestion
      ? `Selected: ${selectedQuestion.title}`
      : "No question selected";

  codingEl(
    "codingCaseLockMessage"
  ).hidden =
    Boolean(selectedQuestion);
}

async function loadCodingAdminTests() {
  const list =
    codingEl(
      "codingAdminTestsList"
    );

  const { data, error } =
    await supabaseClient
      .from("coding_tests")
      .select("*")
      .order(
        "created_at",
        { ascending: false }
      );

  if (error) {
    list.innerHTML =
      `<div class="coding-admin-error">${
        escapeHTML(error.message)
      }</div>`;
    return;
  }

  list.innerHTML =
    (data || []).map(
      (test) => `
        <article class="coding-admin-item ${
          codingAdminState.test?.id
          === test.id
            ? "selected"
            : ""
        }">
          <div>
            <strong>${
              escapeHTML(test.title)
            }</strong>

            <small>
              ${
                escapeHTML(test.status)
              }
              · ${test.duration_minutes} min
              · ${test.total_marks || 0} marks
            </small>
          </div>

          <div class="coding-admin-item-actions">
            <button
              class="action-button secondary"
              type="button"
              data-coding-select-test="${test.id}"
              data-coding-test-title="${
                escapeHTML(test.title)
              }"
            >
              Select
            </button>

            <button
              class="action-button secondary"
              type="button"
              data-coding-toggle-test="${test.id}"
              data-coding-test-status="${
                escapeHTML(test.status)
              }"
            >
              ${
                test.status === "published"
                  ? "Close Test"
                  : "Publish"
              }
            </button>

            <button
              class="action-button danger"
              type="button"
              data-coding-delete-test="${test.id}"
              data-coding-test-title="${
                escapeHTML(test.title)
              }"
            >
              Delete
            </button>
          </div>
        </article>
      `
    ).join("")
    || `<div class="coding-empty-state">
          No coding tests yet.
        </div>`;
}

async function loadCodingAdminQuestions() {
  const list =
    codingEl(
      "codingAdminQuestionsList"
    );

  if (
    !codingAdminState.test
  ) {
    list.innerHTML =
      `<div class="coding-empty-state">
        Select a test first.
      </div>`;
    return;
  }

  const { data, error } =
    await supabaseClient
      .from("coding_questions")
      .select("*")
      .eq(
        "test_id",
        codingAdminState.test.id
      )
      .order(
        "question_number",
        { ascending: true }
      );

  if (error) {
    list.innerHTML =
      `<div class="coding-admin-error">${
        escapeHTML(error.message)
      }</div>`;
    return;
  }

  list.innerHTML =
    (data || []).map(
      (question) => `
        <article class="coding-admin-item ${
          codingAdminState.question?.id
          === question.id
            ? "selected"
            : ""
        }">
          <div>
            <strong>
              Q${question.question_number}.
              ${escapeHTML(question.title)}
            </strong>

            <small>
              ${escapeHTML(
                question.difficulty
              )}
              · ${question.marks} marks
            </small>
          </div>

          <div class="coding-admin-item-actions">
            <button
              class="action-button secondary"
              type="button"
              data-coding-select-question="${
                question.id
              }"
              data-coding-question-title="${
                escapeHTML(
                  question.title
                )
              }"
            >
              Select
            </button>

            <button
              class="action-button danger"
              type="button"
              data-coding-delete-question="${
                question.id
              }"
            >
              Delete
            </button>
          </div>
        </article>
      `
    ).join("")
    || `<div class="coding-empty-state">
          No questions yet.
        </div>`;
}

async function loadCodingAdminCases() {
  const list =
    codingEl(
      "codingAdminCasesList"
    );

  if (
    !codingAdminState.question
  ) {
    list.innerHTML =
      `<div class="coding-empty-state">
        Select a question first.
      </div>`;
    return;
  }

  const { data, error } =
    await supabaseClient
      .from("coding_test_cases")
      .select("*")
      .eq(
        "question_id",
        codingAdminState.question.id
      )
      .order(
        "id",
        { ascending: true }
      );

  if (error) {
    list.innerHTML =
      `<div class="coding-admin-error">${
        escapeHTML(error.message)
      }</div>`;
    return;
  }

  list.innerHTML =
    (data || []).map(
      (testCase, index) => `
        <article class="coding-admin-item">
          <div>
            <strong>
              ${
                testCase.is_hidden
                  ? "🔒 Hidden"
                  : "👁 Public"
              }
              Case ${index + 1}
            </strong>

            <small>
              ${Number(
                testCase.marks || 0
              )} marks ·
              Expected:
              ${escapeHTML(
                testCase.expected_output
                || ""
              )}
            </small>
          </div>

          <button
            class="action-button danger"
            type="button"
            data-coding-delete-case="${
              testCase.id
            }"
          >
            Delete
          </button>
        </article>
      `
    ).join("")
    || `<div class="coding-empty-state">
          No test cases yet.
        </div>`;
}

async function openCodingAdmin() {
  codingEl(
    "codingAdminModal"
  ).hidden = false;

  codingAdminState.test = null;
  codingAdminState.question = null;

  refreshCodingAdminLocks();

  await Promise.all([
    loadCodingAdminTests(),
    loadCodingAdminQuestions(),
    loadCodingAdminCases()
  ]);
}

function closeCodingAdmin() {
  codingEl(
    "codingAdminModal"
  ).hidden = true;
}

async function createCodingTest(
  event
) {
  event.preventDefault();

  const startValue =
    codingEl(
      "codingAdminStartsAt"
    ).value;

  const endValue =
    codingEl(
      "codingAdminEndsAt"
    ).value;

  if (!startValue) {
    codingMessage(
      "codingAdminMessage",
      "Select a start date and time.",
      "error"
    );
    return;
  }

  const payload = {
    title:
      codingEl(
        "codingAdminTitle"
      ).value.trim(),
    duration_minutes:
      Number(
        codingEl(
          "codingAdminDuration"
        ).value
      ),
    starts_at:
      new Date(
        startValue
      ).toISOString(),
    ends_at:
      endValue
        ? new Date(
            endValue
          ).toISOString()
        : null,
    instructions:
      codingEl(
        "codingAdminInstructions"
      ).value.trim(),
    status:
      "draft"
  };

  codingMessage(
    "codingAdminMessage",
    "Creating test..."
  );

  const { data, error } =
    await supabaseClient
      .from("coding_tests")
      .insert(payload)
      .select()
      .single();

  if (error) {
    codingMessage(
      "codingAdminMessage",
      error.message,
      "error"
    );
    return;
  }

  codingAdminState.test = data;
  codingAdminState.question = null;

  codingMessage(
    "codingAdminMessage",
    "✅ Test created. Continue to Step 2.",
    "success"
  );

  refreshCodingAdminLocks();

  await Promise.all([
    loadCodingAdminTests(),
    loadCodingAdminQuestions(),
    loadCodingAdminCases()
  ]);

  codingScrollTo(
    "codingQuestionSection"
  );
}

async function addCodingQuestion(
  event
) {
  event.preventDefault();

  if (
    !codingAdminState.test
  ) {
    codingMessage(
      "codingQuestionAdminMessage",
      "Select a test first.",
      "error"
    );
    return;
  }

  codingMessage(
    "codingQuestionAdminMessage",
    "Adding question..."
  );

  // Always calculate the next question number.
  // This eliminates duplicate-number 409 errors.
  const {
    data: lastQuestion,
    error: numberError
  } = await supabaseClient
    .from("coding_questions")
    .select("question_number")
    .eq(
      "test_id",
      codingAdminState.test.id
    )
    .order(
      "question_number",
      { ascending: false }
    )
    .limit(1);

  if (numberError) {
    codingMessage(
      "codingQuestionAdminMessage",
      numberError.message,
      "error"
    );
    return;
  }

  const nextQuestionNumber =
    lastQuestion?.length
      ? Number(
          lastQuestion[0]
            .question_number
        ) + 1
      : 1;

  const payload = {
    test_id:
      codingAdminState.test.id,
    question_number:
      nextQuestionNumber,
    title:
      codingEl(
        "codingAdminQuestionTitle"
      ).value.trim(),
    description:
      codingEl(
        "codingAdminDescription"
      ).value.trim(),
    difficulty:
      codingEl(
        "codingAdminDifficulty"
      ).value,
    marks:
      Number(
        codingEl(
          "codingAdminMarks"
        ).value
      ),
    starter_code:
      codingEl(
        "codingAdminStarterCode"
      ).value,
    sample_input:
      codingEl(
        "codingAdminSampleInput"
      ).value,
    sample_output:
      codingEl(
        "codingAdminSampleOutput"
      ).value,
    time_limit_ms:
      Number(
        codingEl(
          "codingAdminTimeLimit"
        ).value
      )
  };

  const { data, error } =
    await supabaseClient
      .from("coding_questions")
      .insert(payload)
      .select()
      .single();

  if (error) {
    codingMessage(
      "codingQuestionAdminMessage",
      error.message,
      "error"
    );
    return;
  }

  codingAdminState.question =
    data;

  codingMessage(
    "codingQuestionAdminMessage",
    `✅ Question ${nextQuestionNumber} added. Continue to Step 3.`,
    "success"
  );

  refreshCodingAdminLocks();

  await Promise.all([
    loadCodingAdminTests(),
    loadCodingAdminQuestions(),
    loadCodingAdminCases()
  ]);

  codingScrollTo(
    "codingCaseSection"
  );
}

async function addCodingCase(
  event
) {
  event.preventDefault();

  if (
    !codingAdminState.question
  ) {
    codingMessage(
      "codingCaseAdminMessage",
      "Select a question first.",
      "error"
    );
    return;
  }

  const payload = {
    question_id:
      codingAdminState.question.id,
    input:
      codingEl(
        "codingAdminCaseInput"
      ).value,
    expected_output:
      codingEl(
        "codingAdminCaseOutput"
      ).value,
    is_hidden:
      codingEl(
        "codingAdminCaseHidden"
      ).checked,
    marks:
      Number(
        codingEl(
          "codingAdminCaseMarks"
        ).value
      )
  };

  codingMessage(
    "codingCaseAdminMessage",
    "Adding test case..."
  );

  const { error } =
    await supabaseClient
      .from("coding_test_cases")
      .insert(payload);

  if (error) {
    codingMessage(
      "codingCaseAdminMessage",
      error.message,
      "error"
    );
    return;
  }

  codingMessage(
    "codingCaseAdminMessage",
    "✅ Test case added.",
    "success"
  );

  resetCodingAdminCaseForm();

  await loadCodingAdminCases();
}

async function handleCodingAdminClick(
  event
) {
  const selectTest =
    event.target.closest(
      "[data-coding-select-test]"
    );

  if (selectTest) {
    codingAdminState.test = {
      id:
        selectTest.dataset
          .codingSelectTest,
      title:
        selectTest.dataset
          .codingTestTitle
    };

    codingAdminState.question =
      null;

    resetCodingAdminQuestionForm();
    resetCodingAdminCaseForm();
    refreshCodingAdminLocks();

    await Promise.all([
      loadCodingAdminTests(),
      loadCodingAdminQuestions(),
      loadCodingAdminCases()
    ]);

    codingScrollTo(
      "codingQuestionSection"
    );

    return;
  }

  const selectQuestion =
    event.target.closest(
      "[data-coding-select-question]"
    );

  if (selectQuestion) {
    codingAdminState.question = {
      id:
        selectQuestion.dataset
          .codingSelectQuestion,
      title:
        selectQuestion.dataset
          .codingQuestionTitle
    };

    resetCodingAdminCaseForm();
    refreshCodingAdminLocks();

    await Promise.all([
      loadCodingAdminQuestions(),
      loadCodingAdminCases()
    ]);

    codingScrollTo(
      "codingCaseSection"
    );

    return;
  }

  const toggleTest =
    event.target.closest(
      "[data-coding-toggle-test]"
    );

  if (toggleTest) {
    const testId =
      toggleTest.dataset
        .codingToggleTest;

    const currentStatus =
      toggleTest.dataset
        .codingTestStatus;

    const newStatus =
      currentStatus === "published"
        ? "closed"
        : "published";

    const { error } =
      await supabaseClient
        .from("coding_tests")
        .update({
          status:
            newStatus
        })
        .eq(
          "id",
          testId
        );

    if (error) {
      alert(error.message);
      return;
    }

    await loadCodingAdminTests();
    return;
  }

  const deleteTest =
    event.target.closest(
      "[data-coding-delete-test]"
    );

  if (deleteTest) {
    const testId =
      deleteTest.dataset
        .codingDeleteTest;

    const title =
      deleteTest.dataset
        .codingTestTitle;

    if (
      !confirm(
        `Delete "${title}"?\n\n`
        + "This also deletes its questions, "
        + "test cases, attempts and submissions."
      )
    ) {
      return;
    }

    const { error } =
      await supabaseClient
        .from("coding_tests")
        .delete()
        .eq(
          "id",
          testId
        );

    if (error) {
      alert(error.message);
      return;
    }

    if (
      codingAdminState.test?.id
      === testId
    ) {
      codingAdminState.test =
        null;

      codingAdminState.question =
        null;
    }

    refreshCodingAdminLocks();

    await Promise.all([
      loadCodingAdminTests(),
      loadCodingAdminQuestions(),
      loadCodingAdminCases()
    ]);

    return;
  }

  const deleteQuestion =
    event.target.closest(
      "[data-coding-delete-question]"
    );

  if (deleteQuestion) {
    const questionId =
      deleteQuestion.dataset
        .codingDeleteQuestion;

    if (
      !confirm(
        "Delete this question and all its test cases?"
      )
    ) {
      return;
    }

    const { error } =
      await supabaseClient
        .from("coding_questions")
        .delete()
        .eq(
          "id",
          questionId
        );

    if (error) {
      alert(error.message);
      return;
    }

    if (
      codingAdminState.question?.id
      === questionId
    ) {
      codingAdminState.question =
        null;
    }

    refreshCodingAdminLocks();

    await Promise.all([
      loadCodingAdminQuestions(),
      loadCodingAdminCases()
    ]);

    return;
  }

  const deleteCase =
    event.target.closest(
      "[data-coding-delete-case]"
    );

  if (deleteCase) {
    const caseId =
      deleteCase.dataset
        .codingDeleteCase;

    if (
      !confirm(
        "Delete this test case?"
      )
    ) {
      return;
    }

    const { error } =
      await supabaseClient
        .from("coding_test_cases")
        .delete()
        .eq(
          "id",
          caseId
        );

    if (error) {
      alert(error.message);
      return;
    }

    await loadCodingAdminCases();
  }
}

function addAnotherCodingQuestion() {
  if (
    !codingAdminState.test
  ) {
    codingScrollTo(
      "codingTestAdminForm"
    );
    return;
  }

  codingAdminState.question =
    null;

  resetCodingAdminQuestionForm();
  resetCodingAdminCaseForm();
  refreshCodingAdminLocks();

  codingScrollTo(
    "codingQuestionSection"
  );

  codingEl(
    "codingAdminQuestionTitle"
  ).focus();
}

// ============================================================
// EVENT BINDINGS
// ============================================================

codingEl(
  "openCodingTestButton"
)?.addEventListener(
  "click",
  openCodingTest
);

codingEl(
  "closeCodingTestButton"
)?.addEventListener(
  "click",
  closeCodingTest
);

codingEl(
  "startCodingTestButton"
)?.addEventListener(
  "click",
  startCodingTest
);

codingEl(
  "codingRunButton"
)?.addEventListener(
  "click",
  () => codingRun("run")
);

codingEl(
  "codingRunTestsButton"
)?.addEventListener(
  "click",
  () => codingRun("samples")
);

codingEl(
  "codingEndTestButton"
)?.addEventListener(
  "click",
  endCodingTestWithConfirmation
);

codingEl(
  "codingPrevQuestion"
)?.addEventListener(
  "click",
  async () => {
    try {
      await saveCodingDraft();

      if (
        codingState.currentIndex > 0
      ) {
        codingState.currentIndex -= 1;
        renderCodingQuestion();
      }
    } catch (error) {
      codingEl(
        "codingConsoleOutput"
      ).textContent =
        error.message;
    }
  }
);

codingEl(
  "codingNextQuestion"
)?.addEventListener(
  "click",
  async () => {
    try {
      await saveCodingDraft();

      if (
        codingState.currentIndex
        < codingState.questions.length - 1
      ) {
        codingState.currentIndex += 1;
        renderCodingQuestion();
      }
    } catch (error) {
      codingEl(
        "codingConsoleOutput"
      ).textContent =
        error.message;
    }
  }
);

codingEl(
  "codingSourceEditor"
)?.addEventListener(
  "input",
  () => {
    const question =
      codingState.questions[
        codingState.currentIndex
      ];

    if (question) {
      codingState.codeByQuestion[
        question.id
      ] =
        codingEl(
          "codingSourceEditor"
        ).value;
    }
  }
);

codingEl(
  "manageCodingTestsButton"
)?.addEventListener(
  "click",
  openCodingAdmin
);

codingEl(
  "codingAdminCloseButton"
)?.addEventListener(
  "click",
  closeCodingAdmin
);

document
  .querySelectorAll(
    "[data-coding-admin-close]"
  )
  .forEach(
    (element) => {
      element.addEventListener(
        "click",
        closeCodingAdmin
      );
    }
  );

codingEl(
  "codingTestAdminForm"
)?.addEventListener(
  "submit",
  createCodingTest
);

codingEl(
  "codingQuestionAdminForm"
)?.addEventListener(
  "submit",
  addCodingQuestion
);

codingEl(
  "codingCaseAdminForm"
)?.addEventListener(
  "submit",
  addCodingCase
);

codingEl(
  "codingNewQuestionButton"
)?.addEventListener(
  "click",
  addAnotherCodingQuestion
);

codingEl(
  "codingAdminTestsList"
)?.addEventListener(
  "click",
  handleCodingAdminClick
);

codingEl(
  "codingAdminQuestionsList"
)?.addEventListener(
  "click",
  handleCodingAdminClick
);

codingEl(
  "codingAdminCasesList"
)?.addEventListener(
  "click",
  handleCodingAdminClick
);

codingEl(
  "codingResultHomeButton"
)?.addEventListener(
  "click",
  returnFromCodingResult
);

refreshCodingAdminLocks();
