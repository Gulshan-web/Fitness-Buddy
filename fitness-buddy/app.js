/* ═══════════════════════════════════════════════════════════════
   FITNESS BUDDY – app.js
   IBM Granite AI Integration + Full App Logic
   ═══════════════════════════════════════════════════════════════ */

// ─── IBM GRANITE CONFIG ─────────────────────────────────────────
// All IBM API calls go through the local Node proxy (/api/chat)
// to avoid browser CORS restrictions on iam.cloud.ibm.com.
const IBM_CONFIG = {
  proxyUrl: "/api/chat",           // local server.js handles auth
  projectId: "db036f3d-9475-4510-bf86-e07fb7000f99",
  modelId: "ibm/granite-4-h-small"
};

async function callGranite(messages) {
  const profile = getUserProfile();
  const systemPrompt = buildSystemPrompt(profile);

  const payload = {
    model_id: IBM_CONFIG.modelId,
    project_id: IBM_CONFIG.projectId,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages
    ],
    parameters: {
      max_new_tokens: 700,
      temperature: 0.75,
      top_p: 0.95,
      repetition_penalty: 1.1
    }
  };

  const resp = await fetch(IBM_CONFIG.proxyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Proxy error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  if (data.error) throw new Error(data.error);
  return data?.choices?.[0]?.message?.content || "I'm having trouble responding right now. Please try again.";
}

function buildSystemPrompt(profile) {
  const base = `You are Fitness Buddy, a friendly and expert AI fitness coach powered by IBM Granite.
You provide personalised, practical, and motivating fitness advice.
Always be encouraging, clear, and supportive. Keep answers concise (3-5 paragraphs max).
IMPORTANT DISCLAIMER: Always remind users that your advice is general wellness information and not a substitute for professional medical or dietitian advice when relevant.`;

  if (!profile) return base;

  return `${base}

User Profile:
- Name: ${profile.name || "Friend"}
- Age: ${profile.age || "unknown"}
- Fitness Goal: ${profile.goal || "general fitness"}
- Fitness Level: ${profile.level || "beginner"}
- Available Time: ${profile.time || "30"} min/day
- Preferred Workout: ${profile.workoutType || "home workouts"}
- Food Preferences: ${profile.food || "no specific preferences"}
- Health Notes: ${profile.health || "none"}

Tailor all your recommendations to this user's specific profile, goals, and constraints.`;
}

// ─── APP STATE ──────────────────────────────────────────────────
let chatHistory = [];
let workoutFilter = { level: "all", goal: "all" };
let currentMealTab = "breakfast";
let habitsState = {};
let userProfile = null;

// ─── DATA: WORKOUTS ─────────────────────────────────────────────
const WORKOUTS = [
  {
    id: 1, title: "Morning Power Start", level: "beginner", goal: "general",
    duration: "20 min", type: "🏠 Home",
    exercises: ["10 Jumping Jacks", "10 Push-ups (knee)", "15 Squats", "20s Plank", "10 Lunges each leg"],
    instructions: "Rest 30 seconds between exercises. Do 2 rounds. Focus on form over speed."
  },
  {
    id: 2, title: "Fat Burn HIIT", level: "intermediate", goal: "weight_loss",
    duration: "30 min", type: "🏠 Home",
    exercises: ["30s Burpees", "30s Mountain Climbers", "30s Jump Squats", "30s High Knees", "30s Push-ups"],
    instructions: "20 seconds work, 10 seconds rest per exercise. Complete 4 rounds. Short rest between rounds."
  },
  {
    id: 3, title: "Muscle Builder", level: "intermediate", goal: "muscle",
    duration: "45 min", type: "🏋️ Gym",
    exercises: ["4×8 Bench Press", "4×10 Bent-over Rows", "4×8 Shoulder Press", "3×12 Bicep Curls", "3×12 Tricep Dips"],
    instructions: "Rest 90 seconds between sets. Progressive overload is key — increase weight weekly."
  },
  {
    id: 4, title: "Yoga Flow", level: "beginner", goal: "flexibility",
    duration: "25 min", type: "🧘 Yoga",
    exercises: ["Sun Salutation", "Warrior I & II", "Downward Dog", "Child's Pose", "Cat-Cow Stretch"],
    instructions: "Breathe deeply through each pose. Hold each pose for 5–8 breaths. Never force flexibility."
  },
  {
    id: 5, title: "5K Run Prep", level: "beginner", goal: "stamina",
    duration: "30 min", type: "🏃 Outdoor",
    exercises: ["5 min brisk walk warm-up", "1 min jog / 2 min walk ×6", "5 min cool-down walk"],
    instructions: "This is a walk-run programme. Increase running intervals weekly. Stay hydrated."
  },
  {
    id: 6, title: "Advanced Strength", level: "advanced", goal: "muscle",
    duration: "60 min", type: "🏋️ Gym",
    exercises: ["5×5 Deadlifts", "5×5 Squats", "4×8 Pull-ups", "4×10 Dips", "3×15 Core Circuit"],
    instructions: "Heavy compound lifts. Warm up thoroughly. Track weights and aim for progressive overload each session."
  },
  {
    id: 7, title: "Cardio Blast", level: "intermediate", goal: "stamina",
    duration: "35 min", type: "🏠 Home",
    exercises: ["3 min Jump Rope", "2 min Rest", "3 min Burpees", "2 min Rest", "3 min Dance/Step"],
    instructions: "Aim for 70–80% of max heart rate during cardio segments. Stay consistent."
  },
  {
    id: 8, title: "Core & Flexibility", level: "beginner", goal: "general",
    duration: "20 min", type: "🏠 Home",
    exercises: ["3×20 Crunches", "3×10 Leg Raises", "3×30s Side Plank", "Hip Flexor Stretch", "Seated Forward Fold"],
    instructions: "Perfect for morning or evening. Focus on breathing and slow, controlled movements."
  },
  {
    id: 9, title: "Advanced HIIT", level: "advanced", goal: "weight_loss",
    duration: "40 min", type: "🏠 Home",
    exercises: ["45s Burpee Box Jumps", "45s Plyo Push-ups", "45s Sprint in Place", "45s V-Ups", "45s Tuck Jumps"],
    instructions: "45 seconds on, 15 seconds off. Complete 5 rounds. Elite intensity — only attempt if fit."
  },
  {
    id: 10, title: "Pilates Core", level: "intermediate", goal: "flexibility",
    duration: "30 min", type: "🧘 Yoga",
    exercises: ["The Hundred", "Roll Up", "Leg Circles", "Single Leg Stretch", "Swan Dive"],
    instructions: "Slow and controlled movements. Engage your core throughout. Breathe in a 2-count pattern."
  },
  {
    id: 11, title: "Full Body Beginner", level: "beginner", goal: "muscle",
    duration: "30 min", type: "🏠 Home",
    exercises: ["3×12 Push-ups", "3×15 Squats", "3×10 Glute Bridges", "3×12 Rows (band/water bottle)", "3×30s Plank"],
    instructions: "Rest 60 seconds between sets. Master bodyweight before adding resistance."
  },
  {
    id: 12, title: "Speed & Agility", level: "advanced", goal: "stamina",
    duration: "45 min", type: "🏃 Outdoor",
    exercises: ["Ladder Drills 5×", "4×200m Sprint", "Cone Weave Drills", "Box Jumps 4×10", "Sprint Intervals"],
    instructions: "This develops explosive power and speed. Requires open space. Warm up 10 mins first."
  }
];

// ─── DATA: MEALS ─────────────────────────────────────────────────
const MEALS = {
  breakfast: [
    { emoji: "🥣", name: "Overnight Oats", desc: "Rolled oats with almond milk, berries, and chia seeds. Prep the night before.", macros: ["🔥 340 kcal", "🥩 12g protein", "🌾 55g carbs"] },
    { emoji: "🍳", name: "Veggie Omelette", desc: "3 eggs with spinach, bell pepper, and mushrooms. High protein, low carb.", macros: ["🔥 280 kcal", "🥩 22g protein", "🥑 14g fat"] },
    { emoji: "🍌", name: "Banana Protein Smoothie", desc: "Banana, Greek yoghurt, protein powder, honey, and oat milk blend.", macros: ["🔥 390 kcal", "🥩 30g protein", "🌾 45g carbs"] },
    { emoji: "🍞", name: "Avocado Toast", desc: "Whole grain toast with mashed avocado, poached egg, and chilli flakes.", macros: ["🔥 350 kcal", "🥩 15g protein", "🥑 18g fat"] }
  ],
  lunch: [
    { emoji: "🥗", name: "Grilled Chicken Salad", desc: "Grilled chicken breast over mixed greens, cucumber, tomato, olive oil dressing.", macros: ["🔥 420 kcal", "🥩 38g protein", "🌾 12g carbs"] },
    { emoji: "🌯", name: "Quinoa Power Bowl", desc: "Quinoa, roasted chickpeas, roasted veggies, tahini dressing. Fully plant-based.", macros: ["🔥 480 kcal", "🥩 18g protein", "🌾 65g carbs"] },
    { emoji: "🍱", name: "Tuna & Brown Rice", desc: "Canned tuna with brown rice, edamame, avocado, and low-sodium soy sauce.", macros: ["🔥 450 kcal", "🥩 35g protein", "🌾 50g carbs"] },
    { emoji: "🫕", name: "Lentil Soup", desc: "Red lentil soup with cumin, turmeric, and a squeeze of lemon. Fibre-rich.", macros: ["🔥 360 kcal", "🥩 20g protein", "🌾 55g carbs"] }
  ],
  dinner: [
    { emoji: "🍗", name: "Baked Salmon & Broccoli", desc: "Salmon fillet baked with lemon-herb seasoning, served with steamed broccoli.", macros: ["🔥 510 kcal", "🥩 42g protein", "🥑 22g fat"] },
    { emoji: "🍲", name: "Chicken Stir-Fry", desc: "Lean chicken with mixed vegetables in ginger-garlic sauce over brown rice.", macros: ["🔥 470 kcal", "🥩 36g protein", "🌾 45g carbs"] },
    { emoji: "🥩", name: "Turkey Meatballs", desc: "Lean turkey meatballs in tomato sauce with whole wheat spaghetti.", macros: ["🔥 540 kcal", "🥩 40g protein", "🌾 55g carbs"] },
    { emoji: "🌮", name: "Black Bean Tacos", desc: "Seasoned black beans in corn tortillas with avocado, salsa, and lime. Vegan.", macros: ["🔥 430 kcal", "🥩 16g protein", "🌾 60g carbs"] }
  ],
  snacks: [
    { emoji: "🍎", name: "Apple & Almond Butter", desc: "Sliced apple with 2 tbsp natural almond butter. Perfect pre-workout fuel.", macros: ["🔥 200 kcal", "🥩 5g protein", "🥑 10g fat"] },
    { emoji: "🧀", name: "Cottage Cheese & Berries", desc: "Low-fat cottage cheese topped with mixed berries and a drizzle of honey.", macros: ["🔥 170 kcal", "🥩 18g protein", "🌾 20g carbs"] },
    { emoji: "🥜", name: "Protein Energy Balls", desc: "Oats, peanut butter, honey, chocolate chips rolled into bite-sized balls.", macros: ["🔥 180 kcal", "🥩 8g protein", "🥑 9g fat"] },
    { emoji: "🥕", name: "Hummus & Veggie Sticks", desc: "Carrot, celery, and cucumber sticks with a side of homemade hummus.", macros: ["🔥 150 kcal", "🥩 6g protein", "🌾 18g carbs"] }
  ]
};

// ─── DATA: QUOTES ─────────────────────────────────────────────────
const QUOTES = [
  { text: "The only bad workout is the one that didn't happen.", author: "— Unknown" },
  { text: "Take care of your body. It's the only place you have to live.", author: "— Jim Rohn" },
  { text: "Fitness is not about being better than someone else. It's about being better than you used to be.", author: "— Unknown" },
  { text: "The groundwork of all happiness is health.", author: "— Leigh Hunt" },
  { text: "Success usually comes to those who are too busy to be looking for it.", author: "— Henry David Thoreau" },
  { text: "Your body can stand almost anything. It's your mind that you have to convince.", author: "— Unknown" },
  { text: "Don't wish for it. Work for it.", author: "— Unknown" },
  { text: "Push yourself because no one else is going to do it for you.", author: "— Unknown" },
  { text: "Great things never come from comfort zones.", author: "— Unknown" },
  { text: "The secret of getting ahead is getting started.", author: "— Mark Twain" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "— Zig Ziglar" },
  { text: "It never gets easier. You just get stronger.", author: "— Unknown" }
];

const CHALLENGES = [
  "Do 10 extra push-ups before bed tonight 💪",
  "Drink 8 glasses of water today 💧",
  "Take a 20-minute brisk walk 🚶",
  "Try a 5-minute meditation to start your day 🧘",
  "Eat one extra serving of vegetables today 🥦",
  "Do 50 jumping jacks right now! ⚡",
  "Stretch for 10 minutes before sleeping 🧘",
  "Cook a healthy meal from scratch today 🍳",
  "Go to bed 30 minutes earlier tonight 😴",
  "Take the stairs instead of the lift today 🪜"
];

const FITNESS_TIPS = [
  { icon: "💧", title: "Hydration is Key", text: "Drink water before, during, and after exercise. Dehydration reduces performance by up to 10%." },
  { icon: "😴", title: "Sleep = Recovery", text: "Aim for 7–9 hours of sleep. Muscle repair and hormone balance happen during deep sleep." },
  { icon: "🍽️", title: "Eat to Fuel", text: "Think of food as fuel, not reward. Whole foods, lean protein, and complex carbs support your goals." },
  { icon: "📅", title: "Consistency Beats Intensity", text: "A moderate workout done consistently will always outperform an intense workout done occasionally." },
  { icon: "🧠", title: "Mind-Muscle Connection", text: "Focus on the muscle you're working. Conscious contractions improve muscle activation and growth." },
  { icon: "🔄", title: "Rest Days Matter", text: "Schedule 1–2 rest days per week. Overtraining leads to injury and burnout — recovery is progress." }
];

// ─── DATA: HABITS ─────────────────────────────────────────────────
const HABIT_DEFS = [
  { id: "workout", icon: "🏋️", name: "Workout", desc: "Complete today's workout session", type: "check" },
  { id: "water",   icon: "💧", name: "Water Intake", desc: "Goal: 8 glasses of water", type: "number", unit: "glasses", target: 8 },
  { id: "meal",    icon: "🥗", name: "Healthy Meal", desc: "Ate at least one healthy meal today", type: "check" },
  { id: "sleep",   icon: "😴", name: "Sleep", desc: "Track your sleep hours last night", type: "number", unit: "hours", target: 8 },
  { id: "steps",   icon: "👟", name: "Daily Steps", desc: "Goal: 10,000 steps", type: "number", unit: "steps", target: 10000 }
];

// ─── NAVIGATION ──────────────────────────────────────────────────
function navigateTo(pageId) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"));
  const page = document.getElementById(pageId);
  const link = document.querySelector(`[data-page="${pageId}"]`);
  if (page) { page.classList.add("active"); window.scrollTo({ top: 0, behavior: "smooth" }); }
  if (link) link.classList.add("active");
  closeMenu();
  if (pageId === "workouts")   renderWorkouts();
  if (pageId === "nutrition")  renderMeals(currentMealTab);
  if (pageId === "motivation") renderMotivation();
  if (pageId === "habits")     renderHabits();
  if (pageId === "dashboard")  renderDashboard();
}

document.querySelectorAll(".nav-link").forEach(link => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    navigateTo(link.dataset.page);
  });
});

document.querySelector(".nav-brand").addEventListener("click", () => navigateTo("home"));

const hamburger = document.getElementById("hamburger");
const navLinks  = document.getElementById("navLinks");
hamburger.addEventListener("click", () => navLinks.classList.toggle("open"));
function closeMenu() { navLinks.classList.remove("open"); }

// ─── PROFILE ─────────────────────────────────────────────────────
function getUserProfile() {
  try { return JSON.parse(localStorage.getItem("fb_profile")) || null; } catch { return null; }
}

function saveUserProfile(profile) {
  localStorage.setItem("fb_profile", JSON.stringify(profile));
  userProfile = profile;
}

const profileForm = document.getElementById("profileForm");
profileForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const profile = {
    name: document.getElementById("p-name").value.trim(),
    age: document.getElementById("p-age").value,
    goal: document.getElementById("p-goal").value,
    level: document.getElementById("p-level").value,
    time: document.getElementById("p-time").value,
    workoutType: document.getElementById("p-workout-type").value,
    food: document.getElementById("p-food").value.trim(),
    health: document.getElementById("p-health").value.trim()
  };
  saveUserProfile(profile);
  showProfileSaved(profile);
});

function showProfileSaved(p) {
  document.getElementById("profileSaved").classList.remove("hidden");
  const goalMap = { weight_loss:"Weight Management", muscle:"Muscle Building", general:"General Fitness", flexibility:"Flexibility", stamina:"Stamina" };
  const levelMap = { beginner:"Beginner", intermediate:"Intermediate", advanced:"Advanced" };
  const html = `<div class="profile-summary-row">
    ${p.name ? `<span class="profile-tag">👤 ${p.name}</span>` : ""}
    ${p.age ? `<span class="profile-tag">🎂 Age ${p.age}</span>` : ""}
    ${p.goal ? `<span class="profile-tag">🎯 ${goalMap[p.goal]||p.goal}</span>` : ""}
    ${p.level ? `<span class="profile-tag">📊 ${levelMap[p.level]||p.level}</span>` : ""}
    ${p.time ? `<span class="profile-tag">⏱️ ${p.time} min/day</span>` : ""}
    ${p.food ? `<span class="profile-tag">🥗 ${p.food}</span>` : ""}
  </div>`;
  document.getElementById("profileSummary").innerHTML = html;
}

function loadProfileForm() {
  const p = getUserProfile();
  if (!p) return;
  if (p.name) document.getElementById("p-name").value = p.name;
  if (p.age)  document.getElementById("p-age").value  = p.age;
  if (p.goal) document.getElementById("p-goal").value = p.goal;
  if (p.level) document.getElementById("p-level").value = p.level;
  if (p.time) document.getElementById("p-time").value = p.time;
  if (p.workoutType) document.getElementById("p-workout-type").value = p.workoutType;
  if (p.food) document.getElementById("p-food").value = p.food;
  if (p.health) document.getElementById("p-health").value = p.health;
  showProfileSaved(p);
}

// ─── AI CHAT ─────────────────────────────────────────────────────
async function sendMessage() {
  const input = document.getElementById("chatInput");
  const text  = input.value.trim();
  if (!text) return;

  appendMessage("user", text);
  input.value = "";
  autoResizeTextarea(input);

  chatHistory.push({ role: "user", content: text });
  const btn = document.getElementById("sendBtn");
  btn.disabled = true;
  btn.textContent = "…";

  const typingId = showTyping();
  try {
    const reply = await callGranite(chatHistory.slice(-10));
    removeTyping(typingId);
    appendMessage("ai", reply);
    chatHistory.push({ role: "assistant", content: reply });
  } catch (err) {
    removeTyping(typingId);
    const fallback = getFallbackResponse(text);
    appendMessage("ai", fallback);
    chatHistory.push({ role: "assistant", content: fallback });
    console.warn("Granite API error, using fallback:", err.message);
  }

  btn.disabled = false;
  btn.textContent = "Send ➤";
}

function sendSuggestion(btn) {
  document.getElementById("chatInput").value = btn.textContent.replace(/^[^\s]+\s/, "");
  sendMessage();
}

function handleChatKey(e) {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

function appendMessage(role, text) {
  const container = document.getElementById("chatMessages");
  const isAI = role === "ai";
  const div = document.createElement("div");
  div.className = `msg ${isAI ? "ai-msg" : "user-msg"}`;
  div.innerHTML = `
    <span class="msg-avatar">${isAI ? "🤖" : "👤"}</span>
    <div class="msg-bubble">${formatResponse(text)}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function formatResponse(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^#{1,3}\s(.+)$/gm, "<strong>$1</strong>")
    .replace(/^[-•]\s(.+)$/gm, "• $1")
    .replace(/\n{2,}/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}

function showTyping() {
  const id = "typing_" + Date.now();
  const container = document.getElementById("chatMessages");
  const div = document.createElement("div");
  div.className = "msg ai-msg";
  div.id = id;
  div.innerHTML = `<span class="msg-avatar">🤖</span>
    <div class="msg-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function autoResizeTextarea(ta) {
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
}
document.getElementById("chatInput").addEventListener("input", function() { autoResizeTextarea(this); });

// Offline fallback responses
function getFallbackResponse(question) {
  const q = question.toLowerCase();
  const profile = getUserProfile();
  const name = profile?.name ? `, ${profile.name}` : "";
  const level = profile?.level || "beginner";
  const goal  = profile?.goal  || "general";
  const time  = profile?.time  || "30";
  const food  = profile?.food  || "";

  // ── Meal-specific questions (check BEFORE generic nutrition) ──
  if (q.includes("breakfast") || q.includes("morning meal")) {
    const veg = food.toLowerCase().includes("veg");
    return `Here are some great **breakfast ideas**${name}! 🌅\n\n• **Overnight oats** with berries and chia seeds — prep the night before, zero morning effort\n• **Veggie omelette** (3 eggs, spinach, bell pepper) — high protein, keeps you full for hours\n• **Greek yoghurt parfait** with granola and banana — quick and nutritious\n${veg ? "• **Smoothie bowl** with plant protein, frozen berries, and almond butter topping\n" : "• **Avocado toast + poached egg** on whole grain bread\n"}\nBreakfast fuels your first workout of the day — don't skip it!\n\n⚕️ *Consult a dietitian for a plan tailored to your health needs.*`;
  }
  if (q.includes("lunch") || q.includes("midday")) {
    return `Here are solid **lunch options**${name} to keep your energy steady! ☀️\n\n• **Grilled chicken + quinoa salad** with cucumber, cherry tomatoes, and lemon dressing\n• **Tuna & brown rice bowl** with edamame and avocado — high protein, great for muscle recovery\n• **Lentil soup** with whole grain bread — fibre-rich and filling\n• **Whole wheat wrap** with turkey, hummus, and roasted veggies\n\nAim for a balance of lean protein + complex carbs + healthy fats at lunch to avoid the afternoon energy crash.\n\n⚕️ *Adjust portions to your calorie goals — a dietitian can help calculate yours.*`;
  }
  if (q.includes("dinner") || q.includes("supper") || q.includes("evening meal")) {
    return `Great **dinner ideas**${name} for a healthy evening! 🌙\n\n• **Baked salmon + steamed broccoli** — omega-3s, easy to prep in 20 mins\n• **Chicken stir-fry** with mixed veg in ginger-garlic sauce over brown rice\n• **Turkey meatballs in tomato sauce** with whole wheat spaghetti\n• **Black bean tacos** (corn tortillas, avocado, salsa) — quick, tasty, plant-based\n\n💡 *Tip:* Eat dinner 2–3 hours before bed to improve sleep quality and digestion.\n\n⚕️ *These are general suggestions — a registered dietitian can tailor meals to your specific needs.*`;
  }
  if (q.includes("snack") || q.includes("snacks") || q.includes("between meal")) {
    return `Smart **snack ideas**${name} that fuel without overdoing it! 🍎\n\n• **Apple + almond butter** — fibre + healthy fat, perfect pre-workout\n• **Cottage cheese + berries** — high protein, low calorie\n• **Protein energy balls** (oats, peanut butter, honey) — batch-make on Sunday\n• **Hummus + veggie sticks** (carrot, celery, cucumber) — crunchy and satisfying\n• **A small handful of mixed nuts** — quick energy, great omega-3 source\n\n💡 Aim for snacks under 200 kcal that combine protein + fibre to stay full longer.\n\n⚕️ *Snack needs vary by person — consult a dietitian if unsure.*`;
  }

  // ── Diet plan (specific, not generic nutrition) ──
  if (q.includes("diet plan") || q.includes("meal plan") || q.includes("eating plan")) {
    const goalText = { weight_loss:"a calorie deficit to lose fat", muscle:"a calorie surplus to build muscle", general:"balanced nutrition for overall health", flexibility:"anti-inflammatory foods for joint health", stamina:"high-carb fuelling for endurance" }[goal] || "your fitness goal";
    return `Here's a **sample daily meal plan**${name} designed for ${goalText}: 📋\n\n**Breakfast:** Overnight oats with berries + 2 boiled eggs\n**Mid-morning snack:** Greek yoghurt + banana\n**Lunch:** Grilled chicken breast + brown rice + salad\n**Afternoon snack:** Apple + almond butter\n**Dinner:** Baked fish + roasted vegetables + quinoa\n**Evening (optional):** Cottage cheese or a small protein shake\n\n**Daily targets (approximate):**\n• Protein: 1.6–2g per kg of bodyweight\n• Carbs: 40–50% of calories (adjust for goal)\n• Fats: 25–35% of calories\n• Water: 2.5–3 litres\n\n⚕️ *This is a template — a registered dietitian can build you a precise plan based on blood work and health history.*`;
  }

  // ── Workout questions ──
  if (q.includes("home workout") || (q.includes("workout") && q.includes("home"))) {
    const plans = {
      beginner: "**Beginner Home Workout (20 min):**\n• 10 Push-ups (knee if needed)\n• 15 Bodyweight squats\n• 20 Jumping jacks\n• 30s Plank\n• 10 Glute bridges\n→ Rest 30s between, do 2 rounds",
      intermediate: "**Intermediate Home Workout (30 min):**\n• 15 Push-ups\n• 20 Squats + 10 jump squats\n• 30s Mountain climbers\n• 45s Plank\n• 15 Reverse lunges each leg\n→ Rest 45s between, do 3 rounds",
      advanced: "**Advanced Home HIIT (40 min):**\n• 45s Burpees\n• 45s Plyo push-ups\n• 45s Jump squats\n• 45s V-ups\n• 45s Tuck jumps\n→ 15s rest, 5 rounds"
    };
    return `No gym? No problem${name}! 🏠\n\n${plans[level]}\n\nAll you need is a mat and some space. Progressive overload still applies — add reps or rounds each week!\n\n⚕️ *Check with a fitness professional if you have injuries or health conditions.*`;
  }
  if (q.includes("workout") || q.includes("exercise") || q.includes("training") || q.includes("routine")) {
    const plans = { beginner:"3 sessions/week — push-ups, squats, lunges, planks. 20–30 mins. Master form first.", intermediate:"4 sessions/week mixing strength and cardio. Add bands or light dumbbells for resistance.", advanced:"5 sessions/week with progressive overload. Use push/pull/legs split for maximum gains." };
    return `Here's a workout plan${name} for your level! 💪\n\n**${level.charAt(0).toUpperCase()+level.slice(1)} level:** ${plans[level]}\n\n**Weekly structure:**\n• Day 1: Upper body\n• Day 2: Lower body\n• Day 3: Rest or light walk\n• Day 4: Full body cardio\n• Day 5: Core + flexibility\n\nAlways warm up 5 mins and cool down after every session.\n\n⚕️ *Consult a fitness professional if you have injuries or health conditions.*`;
  }

  // ── Weight / fat loss ──
  if (q.includes("weight loss") || q.includes("lose weight") || q.includes("fat loss") || q.includes("burn fat") || (q.includes("lose") && q.includes("kg"))) {
    return `Here's a science-backed approach to **fat loss**${name}: ⚖️\n\n**Nutrition (80% of results):**\n• Create a 300–500 calorie daily deficit\n• Prioritise protein (1.6g/kg bodyweight) to preserve muscle\n• Cut ultra-processed foods and sugary drinks first\n\n**Training:**\n• 3–4 days of resistance training (preserves muscle during deficit)\n• 2–3 days of cardio (walking, cycling, swimming)\n• NEAT: take stairs, walk more throughout the day\n\n**Recovery:**\n• 7–9 hours sleep (poor sleep spikes hunger hormones)\n• Manage stress — cortisol drives fat storage\n\n💡 Safe rate: 0.5–1 kg/week. Anything faster usually loses muscle too.\n\n⚕️ *Always consult a doctor before significant dietary changes.*`;
  }

  // ── Muscle building ──
  if (q.includes("muscle") || q.includes("bulk") || q.includes("build") || q.includes("gain weight") || q.includes("mass")) {
    return `Let's talk **muscle building**${name}! 💪\n\n**Training (the stimulus):**\n• 3–5 sets of 6–12 reps per exercise\n• Progressive overload every week (more weight or reps)\n• Compound lifts: squats, deadlifts, bench press, rows, pull-ups\n• Train each muscle group 2× per week\n\n**Nutrition (the fuel):**\n• Calorie surplus of 200–300 kcal/day\n• Protein: 1.8–2.2g per kg of bodyweight daily\n• Spread protein across 4–5 meals\n\n**Recovery (where growth happens):**\n• 7–9 hours of sleep every night\n• At least 1–2 rest days per week\n\n⚕️ *A certified personal trainer can optimise your programme.*`;
  }

  // ── Stamina / cardio ──
  if (q.includes("stamina") || q.includes("endurance") || q.includes("cardio") || q.includes("run") || q.includes("running")) {
    return `Improving **stamina and endurance**${name}! ❤️\n\n**Cardio progression (${time} min available):**\n• Week 1–2: Walk/jog intervals — 1 min run, 2 min walk\n• Week 3–4: Increase to 2 min run, 1 min walk\n• Week 5+: Continuous jogging, add distance weekly\n\n**Other endurance builders:**\n• Cycling, swimming, rowing — all low-impact and highly effective\n• HIIT 2× per week alongside steady-state cardio\n• Zone 2 training (conversational pace) for aerobic base\n\n**Nutrition for endurance:**\n• Carbs are your friend — fuel before longer sessions\n• Hydrate well before, during, and after cardio\n\n⚕️ *Listen to your body — cardiac check-up recommended before starting intense cardio.*`;
  }

  // ── Flexibility / yoga ──
  if (q.includes("flexible") || q.includes("flexibility") || q.includes("stretch") || q.includes("yoga") || q.includes("mobility")) {
    return `Improving **flexibility and mobility**${name}! 🧘\n\n**Daily stretch routine (10–15 min):**\n• Hip flexor stretch — 60s each side\n• Hamstring stretch — seated or standing, 60s\n• Chest opener — arms behind back, hold 30s\n• Cat-cow (spinal mobility) — 10 reps\n• Downward dog — 5 deep breaths\n• Seated spinal twist — 45s each side\n\n**Tips:**\n• Stretch when warm (after workout or hot shower)\n• Never bounce — hold each stretch steadily\n• Consistency beats intensity — 10 mins daily > 1 hour weekly\n• Yoga 2–3× per week dramatically improves range of motion\n\n⚕️ *Avoid stretching into pain — consult a physio for specific stiffness issues.*`;
  }

  // ── Sleep ──
  if (q.includes("sleep") || q.includes("rest") || q.includes("recovery")) {
    return `**Sleep is your secret weapon**${name}! 😴\n\nMuscle repair, hormone production, and fat burning all peak during deep sleep.\n\n**How to improve sleep quality:**\n• Consistent sleep/wake time — even on weekends\n• Avoid screens 30–60 mins before bed (blue light suppresses melatonin)\n• Keep room cool (18–20°C) and dark\n• No caffeine after 2 pm\n• Light stretching or breathing exercises before bed\n• Avoid heavy meals within 2 hours of sleep\n\n**Fitness impact of poor sleep:**\n• 40% reduction in muscle synthesis\n• Increased cortisol → more fat storage\n• Higher hunger hormones (ghrelin) → harder to stick to diet\n\nAim for **7–9 hours**. It's as important as your workout!\n\n⚕️ *Persistent sleep issues should be discussed with a doctor.*`;
  }

  // ── Motivation / mental ──
  if (q.includes("motivat") || q.includes("tired") || q.includes("quit") || q.includes("give up") || q.includes("lazy") || q.includes("no energy")) {
    const rnd = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    return `I hear you${name} — some days are harder than others. That's completely normal. 🔥\n\n**"${rnd.text}"** ${rnd.author}\n\n**When motivation is low, try this:**\n• Commit to just 5 minutes — starting is the hardest part\n• Reduce today's workout by 50% — half a workout beats none\n• Write down WHY you started — put it where you can see it\n• Tell a friend your goal — accountability doubles success rates\n• Celebrate small wins — every completed habit matters\n\n**Remember:** Motivation is a feeling, it comes and goes. **Discipline** is what keeps you going. Build the habit and the motivation follows.\n\nYou've got this! 💪`;
  }

  // ── Hydration / water ──
  if (q.includes("water") || q.includes("hydrat") || q.includes("drink")) {
    return `**Hydration guide**${name} — it matters more than most people think! 💧\n\n**Daily targets:**\n• Minimum: 2 litres (8 glasses)\n• Active person: 3–3.5 litres\n• Hot weather or intense exercise: add 500ml per hour of activity\n\n**Tips to drink more:**\n• Start each morning with a full glass of water\n• Keep a 1L bottle visible on your desk\n• Drink a glass before every meal\n• Add lemon, cucumber, or mint if plain water is boring\n• Set phone reminders every 2 hours\n\n**Signs you're dehydrated:**\n• Dark yellow urine, headaches, fatigue, poor workout performance\n\n💡 Even 2% dehydration can reduce exercise performance by 10–20%!\n\n⚕️ *Hydration needs vary — consult a doctor if you have kidney or heart conditions.*`;
  }

  // ── Protein ──
  if (q.includes("protein") || q.includes("supplements") || q.includes("whey") || q.includes("creatine")) {
    return `**Protein and supplements**${name} — let's keep it simple! 🥩\n\n**Protein targets:**\n• General fitness: 1.2–1.6g per kg bodyweight\n• Muscle building: 1.8–2.2g per kg bodyweight\n• Weight loss: 1.6–2g per kg (preserve muscle during deficit)\n\n**Best food sources (highest to lowest):**\n1. Chicken breast, tuna, eggs, Greek yoghurt, cottage cheese\n2. Legumes (lentils, chickpeas, black beans)\n3. Tofu, tempeh, edamame (plant-based)\n\n**On supplements:**\n• **Whey protein** — convenient if you struggle to hit targets from food\n• **Creatine monohydrate** — one of the most researched, proven to improve strength\n• **Everything else** — mostly unnecessary if your diet is solid\n\n💡 Food first, supplements second — they fill gaps, not replace meals.\n\n⚕️ *Check with a doctor before starting supplements, especially if you have health conditions.*`;
  }

  // ── Generic fallback ──
  return `Good question${name}! 🤖\n\nYour IBM Granite AI coach is here to help. Try asking something specific like:\n\n• **"What should I eat for breakfast?"**\n• **"Give me a 30-minute home workout"**\n• **"How do I build muscle fast?"**\n• **"Tips to lose weight without a gym"**\n• **"How much protein do I need?"**\n• **"I'm tired and have no motivation"**\n\nThe more specific your question, the better I can tailor advice to your ${level} level and ${goal.replace("_", " ")} goal! 💪`;
}

// ─── WORKOUTS ────────────────────────────────────────────────────
function renderWorkouts() {
  const grid = document.getElementById("workoutsGrid");
  grid.innerHTML = "";
  const goalLabels = { weight_loss:"Weight Loss", muscle:"Muscle Building", general:"General Fitness", flexibility:"Flexibility", stamina:"Stamina" };

  WORKOUTS.forEach(w => {
    const visible = (workoutFilter.level === "all" || w.level === workoutFilter.level) &&
                    (workoutFilter.goal  === "all" || w.goal  === workoutFilter.goal);
    const card = document.createElement("div");
    card.className = `workout-card${visible ? "" : " hidden"}`;
    card.dataset.level = w.level;
    card.dataset.goal  = w.goal;
    card.innerHTML = `
      <div class="wc-header">
        <div class="wc-title">${w.title}</div>
        <span class="wc-level level-${w.level}">${w.level}</span>
      </div>
      <div class="wc-goal">🎯 ${goalLabels[w.goal] || w.goal} · ${w.type}</div>
      <div class="wc-meta">
        <span>⏱️ ${w.duration}</span>
        <span>🔢 ${w.exercises.length} exercises</span>
      </div>
      <ul class="wc-exercises">${w.exercises.map(e => `<li>${e}</li>`).join("")}</ul>
      <p style="font-size:0.8rem;color:var(--text-muted);margin-top:10px">📌 ${w.instructions}</p>`;
    grid.appendChild(card);
  });
}

document.querySelectorAll("[data-filter='level']").forEach(btn => {
  btn.addEventListener("click", function() {
    document.querySelectorAll("[data-filter='level']").forEach(b => b.classList.remove("active"));
    this.classList.add("active");
    workoutFilter.level = this.dataset.value;
    applyWorkoutFilter();
  });
});
document.querySelectorAll("[data-filter='goal']").forEach(btn => {
  btn.addEventListener("click", function() {
    document.querySelectorAll("[data-filter='goal']").forEach(b => b.classList.remove("active"));
    this.classList.add("active");
    workoutFilter.goal = this.dataset.value;
    applyWorkoutFilter();
  });
});

function applyWorkoutFilter() {
  document.querySelectorAll(".workout-card").forEach(card => {
    const levelOk = workoutFilter.level === "all" || card.dataset.level === workoutFilter.level;
    const goalOk  = workoutFilter.goal  === "all" || card.dataset.goal  === workoutFilter.goal;
    card.classList.toggle("hidden", !(levelOk && goalOk));
  });
}

// ─── NUTRITION ───────────────────────────────────────────────────
function renderMeals(tab) {
  currentMealTab = tab;
  const grid = document.getElementById("mealsGrid");
  grid.innerHTML = "";
  const meals = MEALS[tab] || [];
  meals.forEach(m => {
    const card = document.createElement("div");
    card.className = "meal-card";
    card.innerHTML = `
      <div class="meal-emoji">${m.emoji}</div>
      <div class="meal-name">${m.name}</div>
      <p class="meal-desc">${m.desc}</p>
      <div class="meal-macros">${m.macros.map(x => `<span class="macro-badge">${x}</span>`).join("")}</div>`;
    grid.appendChild(card);
  });
}

document.querySelectorAll(".meal-tab").forEach(tab => {
  tab.addEventListener("click", function() {
    document.querySelectorAll(".meal-tab").forEach(t => t.classList.remove("active"));
    this.classList.add("active");
    renderMeals(this.dataset.meal);
  });
});

// ─── MOTIVATION ──────────────────────────────────────────────────
let quoteIndex = 0;
function renderMotivation() {
  quoteIndex = Math.floor(Math.random() * QUOTES.length);
  displayQuote();
  const challengeIdx = new Date().getDate() % CHALLENGES.length;
  document.getElementById("challengeText").textContent = CHALLENGES[challengeIdx];
  const grid = document.getElementById("fitnessTipsGrid");
  grid.innerHTML = "";
  FITNESS_TIPS.forEach(tip => {
    const card = document.createElement("div");
    card.className = "tip-card card";
    card.innerHTML = `<div class="tip-card-icon">${tip.icon}</div><h4>${tip.title}</h4><p>${tip.text}</p>`;
    grid.appendChild(card);
  });
}

function displayQuote() {
  const q = QUOTES[quoteIndex];
  document.getElementById("quoteText").textContent = q.text;
  document.getElementById("quoteAuthor").textContent = q.author;
}

function loadNewQuote() {
  quoteIndex = (quoteIndex + 1) % QUOTES.length;
  displayQuote();
}

// ─── HABITS ──────────────────────────────────────────────────────
function getTodayKey() { return new Date().toISOString().slice(0, 10); }

function loadHabitsState() {
  try {
    const stored = JSON.parse(localStorage.getItem("fb_habits")) || {};
    const today = getTodayKey();
    return stored[today] || {};
  } catch { return {}; }
}

function saveHabitsState(state) {
  try {
    const stored = JSON.parse(localStorage.getItem("fb_habits")) || {};
    stored[getTodayKey()] = state;
    localStorage.setItem("fb_habits", JSON.stringify(stored));
  } catch {}
}

function renderHabits() {
  habitsState = loadHabitsState();
  const grid = document.getElementById("habitsGrid");
  grid.innerHTML = "";
  document.getElementById("todayDate").textContent = new Date().toLocaleDateString("en-US", { weekday:"long", year:"numeric", month:"long", day:"numeric" });

  HABIT_DEFS.forEach(h => {
    const isDone = isHabitDone(h);
    const card = document.createElement("div");
    card.className = `habit-card${isDone ? " done" : ""}`;
    card.id = `habit_${h.id}`;
    card.innerHTML = `
      <div class="habit-header">
        <span class="habit-icon">${h.icon}</span>
        <span class="habit-check">${isDone ? "✅" : ""}</span>
      </div>
      <div class="habit-name">${h.name}</div>
      <div class="habit-desc">${h.desc}</div>
      ${h.type === "number" ? `
        <div class="habit-input" onclick="event.stopPropagation()">
          <input type="number" id="hi_${h.id}" placeholder="Enter ${h.unit}…" value="${habitsState[h.id]?.value || ""}" min="0" />
        </div>` : ""}`;
    if (h.type === "check") {
      card.addEventListener("click", () => toggleCheckHabit(h.id));
    } else {
      card.querySelector(`#hi_${h.id}`).addEventListener("change", (e) => updateNumberHabit(h.id, e.target.value, h.target));
    }
    grid.appendChild(card);
  });
  updateHabitProgress();
  renderStreaks();
}

function isHabitDone(h) {
  const s = habitsState[h.id];
  if (!s) return false;
  if (h.type === "check") return s.done === true;
  return s.value >= h.target;
}

function toggleCheckHabit(id) {
  if (!habitsState[id]) habitsState[id] = {};
  habitsState[id].done = !habitsState[id].done;
  saveHabitsState(habitsState);
  renderHabits();
}

function updateNumberHabit(id, value, target) {
  habitsState[id] = { value: parseFloat(value) || 0, target };
  saveHabitsState(habitsState);
  updateHabitProgress();
  renderHabits();
}

function updateHabitProgress() {
  const done = HABIT_DEFS.filter(h => isHabitDone(h)).length;
  const pct  = Math.round((done / HABIT_DEFS.length) * 100);
  document.getElementById("habitProgressFill").style.width = pct + "%";
  document.getElementById("habitProgressText").textContent = `${done}/${HABIT_DEFS.length} habits completed (${pct}%)`;
}

function renderStreaks() {
  const stored = JSON.parse(localStorage.getItem("fb_habits")) || {};
  const display = document.getElementById("streaksDisplay");
  const rows = HABIT_DEFS.map(h => {
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayState = stored[key] || {};
      const s = dayState[h.id];
      let done = false;
      if (h.type === "check" && s?.done) done = true;
      if (h.type === "number" && s?.value >= h.target) done = true;
      if (done) streak++; else break;
    }
    return `<div class="streak-item"><div class="streak-num">${streak}</div><div>${h.icon} ${h.name}</div></div>`;
  });
  display.innerHTML = `<div class="streaks-row">${rows.join("")}</div>`;
}

// ─── DASHBOARD ───────────────────────────────────────────────────
function renderDashboard() {
  const profile = getUserProfile();

  // Greeting
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const name  = profile?.name || "there";
  document.getElementById("dashboardGreeting").textContent = `${greet}, ${name}! Here's your fitness overview for today.`;

  // Workout
  if (profile?.level) {
    const levelWorkouts = WORKOUTS.filter(w => w.level === profile.level);
    const w = levelWorkouts[new Date().getDate() % levelWorkouts.length];
    document.getElementById("dashWorkoutBody").innerHTML = w
      ? `<strong>${w.title}</strong><br/><small>${w.type} · ${w.duration}</small><br/><br/><button class="btn btn-sm btn-outline" onclick="navigateTo('workouts')">View Details</button>`
      : "View workouts for your level in the Workouts section.";
  }

  // Motivation
  const q = QUOTES[new Date().getDate() % QUOTES.length];
  document.getElementById("dashMotivationBody").innerHTML = `<em>"${q.text}"</em><br/><small>${q.author}</small>`;

  // Meal
  const mealKeys = Object.keys(MEALS);
  const mealKey = mealKeys[new Date().getHours() < 11 ? 0 : new Date().getHours() < 15 ? 1 : 2];
  const meals = MEALS[mealKey];
  const meal = meals[new Date().getDate() % meals.length];
  document.getElementById("dashMealBody").innerHTML = `<strong>${meal.emoji} ${meal.name}</strong><br/><small>${meal.desc}</small><br/><br/><button class="btn btn-sm btn-outline" onclick="navigateTo('nutrition')">More Ideas</button>`;

  // Habits
  habitsState = loadHabitsState();
  const done = HABIT_DEFS.filter(h => isHabitDone(h)).length;
  const pct  = Math.round((done / HABIT_DEFS.length) * 100);
  document.getElementById("dashHabitFill").style.width = pct + "%";
  document.getElementById("dashHabitText").innerHTML = `${done}/${HABIT_DEFS.length} habits done today (${pct}%)<br/><button class="btn btn-sm btn-outline" style="margin-top:8px" onclick="navigateTo('habits')">Update Habits</button>`;

  // Goal
  const goalMap = { weight_loss:"⚖️ Weight Management", muscle:"💪 Muscle Building", general:"🏃 General Fitness", flexibility:"🧘 Flexibility", stamina:"❤️ Stamina" };
  const goalText = profile?.goal ? goalMap[profile.goal] || profile.goal : "Not set";
  document.getElementById("dashGoalBody").innerHTML = `<div style="font-size:1.2rem;font-weight:700;margin-bottom:8px">${goalText}</div><small style="color:var(--text-muted)">Level: ${profile?.level || "Not set"} · ${profile?.time || "?"} min/day</small><br/><button class="btn btn-sm btn-outline" style="margin-top:10px" onclick="navigateTo('profile')">Edit Profile</button>`;

  // Stats
  const stored = JSON.parse(localStorage.getItem("fb_habits")) || {};
  const days = Object.keys(stored).length;
  document.getElementById("dashStatsBody").innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div style="text-align:center"><div style="font-size:1.8rem;font-weight:800;color:var(--accent)">${days}</div><div style="font-size:0.8rem;color:var(--text-muted)">Days Tracked</div></div>
      <div style="text-align:center"><div style="font-size:1.8rem;font-weight:800;color:var(--success)">${pct}%</div><div style="font-size:0.8rem;color:var(--text-muted)">Today's Progress</div></div>
    </div>`;
}

// ─── INIT ────────────────────────────────────────────────────────
function init() {
  loadProfileForm();
  // Pre-render workouts and meals for fast first visit
  renderWorkouts();
  renderMeals("breakfast");
  renderMotivation();
  renderHabits();
  renderDashboard();
}

document.addEventListener("DOMContentLoaded", init);
