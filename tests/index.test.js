const {UniqueIndexError} = require("..//src/index");

test("it parses single column constraint", () => {
  let attrs = {
    table: "test_table",
    constraint: "test_constraint",
    detail: "Key (email)=(support@fingerprintjs.com) already exists."
  };
  let err = new UniqueIndexError(attrs)
  expect(err.columns).toEqual(["email"]);
});

test("it parses multiple column constraint", () => {
  let attrs = {
    table: "test_table",
    constraint: "test_constraint",
    detail: "Key (customer_id, display_name)=(customer1234, Corporation1) already exists."
  };
  let err = new UniqueIndexError(attrs)
  expect(err.columns).toEqual(["customer_id", "display_name"]);
});
