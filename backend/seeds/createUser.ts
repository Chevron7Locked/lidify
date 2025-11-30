import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import * as readline from "readline";

const prisma = new PrismaClient();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function prompt(question: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(question, (answer) => resolve(answer));
    });
}

async function main() {
    const username = await prompt("Username: ");
    const password = await prompt("Password: ");
    const role = await prompt("Role (user/admin) [user]: ");

    if (!username || !password) {
        console.error("Username and password required");
        process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
        data: {
            username,
            passwordHash,
            role: role || "user",
        },
    });

    console.log(`\nCreated user: ${user.username} (${user.role})`);
    rl.close();
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
