// 🏋️ GymBody Egzersiz Havuzu — AI sadece bu listeden seçecek
// Türkiye'deki ortalama salonlarda bulunan ekipmanlara göre seçildi
// (Barbell, Dumbbell, temel makineler, Cable, vücut ağırlığı — lüks/nadir makineler hariç)

const EXERCISE_LIST = {
  chest: [
    "Bench Press",
    "Incline Bench Press",
    "Incline Dumbbell Press",
    "Decline Bench Press",
    "Cable Bench Press",
    "Dumbbell Incline Flyes",
    "Push-ups",
    "Dips",
    "Cable Flyes"
  ],
  back: [
    "Deadlift",
    "Romanian Deadlift",
    "Pull-ups",
    "Lat Pulldown",
    "Seated Cable Row",
    "Barbell Row",
    "One Arm Dumbbell Row",
    "Chin-ups",
  ],
  legs: [
    "Barbell Full Squat",
    "Leg Press",
    "Split Squat",
    "Leg Extension",
    "Leg Curl",
    "Romanian Deadlift",
    "Calf Raises",
    "Goblet Squat",
    "Walking Lunges",
    "Dumbbell Squat"
  ],
  shoulders: [
    "Dumbbell Shoulder Press",
    "Cable Lateral Raise",
    "Dumbbell Lateral Raise",
    "Barbell Front Raise",
    "Standing Rear Delt Row",
    "Upright Row",
    "Military Press"
  ],
  arms: [
    "Dumbbell Biceps Curl",
    "Hammer Curl",
    "Barbell Curl",
    "Cable Curl",
    "Tricep Pushdown",
    "Tricep Dips",
    "Overhead Tricep Extension",
    "Close Grip Bench Press",
    "Cable Pushdown"
  ],
  abs: [
    "Plank",
    "Crunches",
    "Hanging Leg Raise",
    "Russian Twist",
    "Cable Crunch",
    "Bicycle Crunch",
    "Mountain Climbers",
    "Sit-ups",
    "Leg Raises"
  ],
  fullbody: [
    "Burpees",
    "Kettlebell Swing",
    "Farmer's Walk"
  ]
};

module.exports = EXERCISE_LIST;
