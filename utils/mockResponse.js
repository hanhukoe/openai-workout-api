// utils/mockResponse.js

export const getMockProgramResponse = () => {
  return {
    program_title: "12-Week Hyrox Hero",
    blocks: [
      {
        title: "Ramp-Up Phase",
        block_type: "Base",
        summary: "Build cardiovascular endurance and establish workout habits.",
        week_range: [1, 3]
      },
      {
        title: "Build Strength & Power",
        block_type: "Build",
        summary: "Increase strength capacity and anaerobic threshold.",
        week_range: [4, 8]
      },
      {
        title: "Race Prep & Taper",
        block_type: "Peak",
        summary: "Sharpen race readiness and reduce volume.",
        week_range: [9, 12]
      }
    ],
    workouts: {
      "1": {
        days: [
          {
            day: "Monday",
            focus_area: "Cardio Endurance",
            duration_min: 45,
            structure_type: "steady_state",
            quote: "One step at a time gets you closer to the start line.",
            warmup: [{ name: "Jumping Jacks" }, { name: "Arm Circles" }],
            main_set: [
              { name: "Treadmill Run", sets: 1, reps: null, rest_after_sec: 60 },
              { name: "Rowing Machine", sets: 1, reps: null, rest_after_sec: 60 }
            ],
            cooldown: [{ name: "Quad Stretch" }, { name: "Hamstring Stretch" }]
          },
          {
            day: "Tuesday",
            focus_area: "Strength - Lower Body",
            duration_min: 50,
            structure_type: "superset",
            quote: "Strong legs carry strong minds.",
            warmup: [{ name: "Bodyweight Squats" }],
            main_set: [
              { name: "Barbell Back Squat", sets: 4, reps: 10, rest_after_sec: 60 },
              { name: "Walking Lunges", sets: 3, reps: 12, rest_after_sec: 45 }
            ],
            cooldown: [{ name: "Hip Flexor Stretch" }]
          },
          {
            day: "Wednesday",
            focus_area: "Rest",
            duration_min: 0,
            structure_type: "recovery",
            quote: "Recovery is where progress begins.",
            warmup: [],
            main_set: [],
            cooldown: []
          }
        ]
      },
      "2": { days: [] },
      "3": { days: [] }
    }
  };
};
