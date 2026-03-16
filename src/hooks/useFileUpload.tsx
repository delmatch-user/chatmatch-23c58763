import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface UploadedFile {
  name: string;
  url: string;
  type: string;
  size: number;
}

export function useFileUpload() {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadFile = async (file: File, userId: string): Promise<UploadedFile | null> => {
    if (!file) return null;

    // Validate file size (max 50MB for videos)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('Arquivo muito grande. Máximo de 50MB.');
      return null;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from('chat-attachments')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        console.error('Upload error:', error);
        toast.error('Erro ao enviar arquivo');
        return null;
      }

      const { data: urlData } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(data.path);

      setUploadProgress(100);

      return {
        name: file.name,
        url: urlData.publicUrl,
        type: file.type,
        size: file.size,
      };
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Erro ao enviar arquivo');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const uploadMultipleFiles = async (files: FileList, userId: string): Promise<UploadedFile[]> => {
    const uploadedFiles: UploadedFile[] = [];

    for (const file of Array.from(files)) {
      const result = await uploadFile(file, userId);
      if (result) {
        uploadedFiles.push(result);
      }
    }

    return uploadedFiles;
  };

  return {
    uploadFile,
    uploadMultipleFiles,
    uploading,
    uploadProgress,
  };
}
