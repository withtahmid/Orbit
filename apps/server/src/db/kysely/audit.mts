// import { sql } from "kysely";

// type AddAuditColumnsFn<T> = (table: T) => T;

// export const addAuditColumns: AddAuditColumnsFn<any> = (table) => {
//     return table
//         .addColumn("created_at", "timestamptz", (col) =>
//             col.notNull().defaultTo(sql`NOW()`)
//         )
//         .addColumn("updated_at", "timestamptz", (col) =>
//             col.notNull().defaultTo(sql`NOW()`)
//         )
//         .addColumn("created_by", "varchar(26)", (col) =>
//             col.references("user.id").notNull().onDelete("restrict")
//         )
//         .addColumn("updated_by", "varchar(26)", (col) =>
//             col.references("user.id").notNull().onDelete("restrict")
//         )
//         .addColumn("archived_at", "timestamptz", (col) =>
//             col.defaultTo(sql`NULL`)
//         )
//         .addColumn("archived_by", "varchar(26)", (col) =>
//             col
//                 .references("user.id")
//                 .onDelete("restrict")
//                 .defaultTo(sql`NULL`)
//         );
// };
