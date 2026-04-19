import React from "react";
import { sendEmail } from "../services/mail/mailer.mjs";
import publicProcedure from "../trpc/middlewares/public.mjs";
import { safeAwait } from "../utils/safeAwait.mjs";

export const healthProcedure = publicProcedure.query(async ({ ctx }) => {
    const [dbError, dbResult] = await safeAwait(
        ctx.services.pgPool.query("SELECT 1 + 1 AS result")
    );
    const now = new Date().toISOString();

    // Check mail service
    let mailStatus;
    try {
        const TestEmailComponent = ({ name }: { name: string }) => {
            return React.createElement(
                "div",
                null,
                React.createElement("h1", null, `Hello, ${name}!`),
                React.createElement("p", null, "This is a test email sent from our application.")
            );
        };

        // sendEmail("test@example.com", "Test Email", TestEmailComponent, { name: "John Doe" })
        //     .then(() => console.log("Test email sent successfully"))
        //     .catch(console.error);
        mailStatus = {
            status: "UP",
            message: "Mail service is operational",
            timestamp: now,
        };
    } catch (mailError) {
        const errorMessage = mailError instanceof Error ? mailError.message : "Unknown error";
        mailStatus = {
            status: "DOWN",
            message: `Mail service error: ${errorMessage}`,
            timestamp: now,
        };
    }

    return {
        server: {
            status: "UP",
            message: "Server is running",
            timestamp: now,
        },
        database: dbError
            ? {
                  status: "DOWN",
                  message: `Database error: ${dbError.message}`,
                  timestamp: now,
              }
            : {
                  status: "UP",
                  message: `Database connection successful! Result of 1 + 1: ${dbResult.rows[0].result}`,
                  timestamp: now,
              },
        mail: mailStatus,
    };
});
