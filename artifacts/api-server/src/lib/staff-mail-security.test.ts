import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mailSettingsInput, messageInput, publicAddress, sealPassword, unlockPassword, resolveMailHost } from "./staff-mail-security";

const secret = "a-synthetic-test-key-that-is-not-an-actual-secret";
const settings = {
  expectedVersion: 0, smtpHost: "server273-1.web-hosting.com", smtpPort: 465,
  imapHost: "server273-1.web-hosting.com", imapPort: 993,
  username: "synthetic@example.test", password: "synthetic-mailbox-password",
  fromName: "SOSO Africa", publicOrigin: "https://example.test",
  enabled: false, newsletterEnabled: false, policyConfirmed: false, hourlyLimit: 0,
};
test("mail passwords are encrypted, randomized and authenticated with context-separated keys", () => {
  const first = sealPassword("synthetic-password", secret);
  const second = sealPassword("synthetic-password", secret);
  assert.notEqual(first, second);
  assert(!first.includes("synthetic-password"));
  assert.equal(unlockPassword(first, secret), "synthetic-password");
  assert.throws(() => unlockPassword(first, `${secret}-changed`), /cannot be unlocked/);
  const pieces = first.split(".");
  const body = Buffer.from(pieces[2], "base64url"); body[0] ^= 1; pieces[2] = body.toString("base64url");
  assert.throws(() => unlockPassword(pieces.join("."), secret), /cannot be unlocked/);
  assert.throws(() => sealPassword("synthetic", "short"), /stable SESSION_SECRET/);
});
test("only encrypted transport ports and explicit full configuration are accepted", () => {
  assert(mailSettingsInput.safeParse(settings).success);
  assert(mailSettingsInput.safeParse({ ...settings, smtpPort: 587 }).success);
  for (const change of [{smtpPort:25},{imapPort:143},{publicOrigin:"http://example.test"},{publicOrigin:"https://user:pass@example.test"},{publicOrigin:"https://example.test/path"},{fromName:"SOSO\r\nBcc: bad@example.test"},{hourlyLimit:-1},{hourlyLimit:1.5},{password:""},{unexpected:true}]) {
    assert(!mailSettingsInput.safeParse({ ...settings, ...change }).success);
  }
  const {password, ...withoutPassword} = settings;
  assert(mailSettingsInput.safeParse(withoutPassword).success);
});
test("local, private, metadata, multicast and mapped-private IP targets are blocked", async () => {
  for (const address of ["127.0.0.1","10.0.0.1","172.16.0.1","192.168.1.1","169.254.169.254","0.0.0.0","224.0.0.1","::1","fe80::1","fc00::1","::ffff:127.0.0.1","::ffff:169.254.169.254"]) assert.equal(publicAddress(address), false, address);
  assert.equal(publicAddress("8.8.8.8"), true);
  assert.equal(publicAddress("2606:4700:4700::1111"), true);
  await assert.rejects(resolveMailHost("localhost"), /public mail-server hostname/);
  await assert.rejects(resolveMailHost("127.0.0.1"), /public mail-server hostname/);
});
test("direct mail validates one recipient, header safety, size and idempotency identifiers", () => {
  const input = { idempotencyKey: randomUUID(), to: "synthetic@example.test", subject: "A test", text: "Plain text" };
  assert(messageInput.safeParse(input).success);
  for (const change of [{to:"a@example.test,b@example.test"},{subject:"Hi\nBcc: attacker@example.test"},{idempotencyKey:"not-an-id"},{text:"x".repeat(24001)},{html:"<script>bad()</script>"},{reply:{uid:1,folder:"inbox"}}]) {
    assert(!messageInput.safeParse({...input,...change}).success);
  }
});
