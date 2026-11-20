// Seed: one ADMIN user, demo professors, all four programs, sample
// courses/students (plan Step 2) + a day of demo attendance so the
// "re-open a past date" flow can be tried immediately.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const FIRST = [
  "Aarav", "Diya", "Ishaan", "Kavya", "Meera", "Arjun", "Neha", "Rohan",
  "Sneha", "Vikram", "Ananya", "Kabir",
];
const LAST = ["Patel", "Sharma", "Iyer", "Nair", "Reddy", "Gupta", "Menon", "Joshi"];

function studentName(i: number): string {
  return `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]}`;
}

async function main() {
  console.log("Seeding...");
  await prisma.attendanceRecord.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.student.deleteMany();
  await prisma.course.deleteMany();
  await prisma.professor.deleteMany();
  await prisma.program.deleteMany();

  const adminHash = await bcrypt.hash("admin123", 10);
  const profHash = await bcrypt.hash("prof123", 10);

  await prisma.professor.create({
    data: {
      name: "Dr. Anjali Verma (HoD)",
      username: "admin",
      passwordHash: adminHash,
      role: "ADMIN",
    },
  });
  const meera = await prisma.professor.create({
    data: { name: "Dr. Meera Sharma", username: "meera", passwordHash: profHash },
  });
  const rajesh = await prisma.professor.create({
    data: { name: "Dr. Rajesh Iyer", username: "rajesh", passwordHash: profHash },
  });

  const programs = await Promise.all(
    ["B.Ed I Year", "B.Ed II Year", "Integrated BA-B.Ed", "B.Sc-B.Ed"].map((name) =>
      prisma.program.create({ data: { name } })
    )
  );

  const [bed1, bed2, ibe, sbe] = programs;

  const courseDefs = [
    { program: bed1, code: "EDU-101", title: "Childhood and Growing Up", professor: meera },
    { program: bed1, code: "EDU-102", title: "Contemporary India and Education", professor: rajesh },
    { program: bed2, code: "EDU-201", title: "Assessment for Learning", professor: meera },
    { program: bed2, code: "EDU-202", title: "Inclusive Education", professor: rajesh },
    { program: ibe, code: "IBE-101", title: "Educational Psychology", professor: meera },
    { program: ibe, code: "IBE-102", title: "Philosophy of Education", professor: rajesh },
    { program: sbe, code: "SBE-101", title: "Pedagogy of Physical Science", professor: meera },
    { program: sbe, code: "SBE-102", title: "Pedagogy of Mathematics", professor: rajesh },
  ];

  const rollPrefix: Record<string, string> = {
    [bed1.id]: "BED1",
    [bed2.id]: "BED2",
    [ibe.id]: "IBE",
    [sbe.id]: "SBE",
  };

  for (const p of programs) {
    const prefix = rollPrefix[p.id];
    for (let i = 0; i < 10; i++) {
      await prisma.student.create({
        data: {
          rollNo: `${prefix}-${String(i + 1).padStart(2, "0")}`,
          name: studentName(i + p.name.length),
          programId: p.id,
        },
      });
    }
  }

  const courses: { id: string; code: string; title: string }[] = [];
  for (const def of courseDefs) {
    const course = await prisma.course.create({
      data: {
        code: def.code,
        title: def.title,
        programId: def.program.id,
        professorId: def.professor.id,
      },
    });
    const students = await prisma.student.findMany({
      where: { programId: def.program.id },
    });
    await prisma.enrollment.createMany({
      data: students.map((s) => ({ courseId: course.id, studentId: s.id })),
    });
    courses.push(course);
  }

  // Demo attendance: yesterday, first course — one marked absent, one late, one on leave
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const demoCourse = courses[0];
  const roster = await prisma.enrollment.findMany({
    where: { courseId: demoCourse.id, active: true },
    include: { student: true },
    orderBy: { student: { rollNo: "asc" } },
  });
  const demoDate = isoDate(yesterday);
  for (let i = 0; i < roster.length; i++) {
    const status =
      i === 2 ? "ABSENT" : i === 5 ? "LATE" : i === 8 ? "LEAVE" : "PRESENT";
    await prisma.attendanceRecord.create({
      data: {
        courseId: demoCourse.id,
        studentId: roster[i].studentId,
        date: demoDate,
        status,
        markedById: meera.id,
      },
    });
  }

  // Audit entries so the admin audit tab has history out of the box (Phase 2)
  await prisma.auditLog.createMany({
    data: [
      {
        action: "SAVE_ATTENDANCE",
        entityType: "attendance",
        entityId: `${demoCourse.id}:${demoDate}`,
        entityLabel: `${demoCourse.code} · ${demoDate}`,
        details: JSON.stringify({
          date: demoDate,
          created: roster.length,
          changed: [],
          changedMore: 0,
          unchanged: 0,
        }),
        actorId: meera.id,
        actorName: meera.name,
        courseId: demoCourse.id,
      },
      {
        action: "CREATE_COURSE",
        entityType: "course",
        entityId: demoCourse.id,
        entityLabel: `${demoCourse.code} · ${demoCourse.title}`,
        details: JSON.stringify({ programName: bed1.name }),
        actorId: meera.id,
        actorName: meera.name,
        courseId: demoCourse.id,
      },
    ],
  });

  // Student self-view credentials (Phase 2): username = roll number
  // (lowercase), password = roll number, so admins can announce the pattern.
  const allStudents = await prisma.student.findMany();
  for (const s of allStudents) {
    await prisma.student.update({
      where: { id: s.id },
      data: {
        username: s.rollNo.toLowerCase(),
        passwordHash: await bcrypt.hash(s.rollNo, 10),
      },
    });
  }

  console.log(`Seeded 3 accounts, ${programs.length} programs, ${courses.length} courses, ${programs.length * 10} students, demo attendance for ${demoDate}.`);
  console.log("Admin:    admin / admin123");
  console.log("Professor: meera / prof123");
  console.log("Professor: rajesh / prof123");
  console.log("Student (read-only): bed1-01 / BED1-01  (username = roll number lowercase, password = roll number)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
