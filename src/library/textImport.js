// Bulk import of plain-text programs: one creation per file, mode auto.

export async function importTextFiles(lib, files) {
  const made = []
  for (const { name, text } of files) {
    made.push(await lib.createCreation({ name: name.replace(/\.[^./\\]*$/, ''), mode: 'auto', code: text }))
  }
  return made
}
