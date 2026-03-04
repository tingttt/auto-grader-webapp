export type UploadResponse = {
  documentId: string;
  moduleId: string;
  studentName: string;
  pdfUrl: string;
};

export async function uploadDocument(params: {
  moduleId: string;
  studentName?: string;
  file: File;
}): Promise<UploadResponse> {
  const form = new FormData();
  form.append("module_id", params.moduleId);
  form.append("student_name", params.studentName ?? "");
  form.append("file", params.file);

  const res = await fetch("http://localhost:8000/upload", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Upload failed with ${res.status}`);
  }
  return res.json();
}

export async function uploadCodeZip(params: {
  moduleId: string;
  studentName?: string;
  file: File;
}): Promise<UploadResponse> {
  const form = new FormData();
  form.append("module_id", params.moduleId);
  form.append("student_name", params.studentName ?? "");
  form.append("file", params.file);

  const res = await fetch("http://localhost:8000/upload-code-zip", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Upload failed with ${res.status}`);
  }
  return res.json();
}