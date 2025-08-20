import { generateDiffFile } from '@git-diff-view/file';
import { useDiffEntries } from '@/hooks/useDiffEntries';
import { useMemo, useContext, useCallback, useState, useEffect } from 'react';
import { 
  TaskSelectedAttemptContext,
  TaskAttemptDataContext 
} from '@/components/context/taskDetailsContext.ts';
import { Diff } from 'shared/types';
import { getHighLightLanguageFromPath } from '@/utils/extToLanguage';
import { Loader } from '@/components/ui/loader';
import DiffCard from '@/components/DiffCard';
import { FileText } from 'lucide-react';

function DiffTab() {
  const { selectedAttempt } = useContext(TaskSelectedAttemptContext);
  const { isAttemptRunning } = useContext(TaskAttemptDataContext);
  const [loading, setLoading] = useState(true);
  const { diffs, error } = useDiffEntries(selectedAttempt?.id ?? null, true);

  useEffect(() => {
    if (diffs.length > 0) {
      setLoading(false);
    } else if (!isAttemptRunning) {
      // If attempt is not running and we have no diffs, stop loading
      // Add a small delay to ensure any pending diffs are received
      const timer = setTimeout(() => {
        setLoading(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [diffs, isAttemptRunning]);

  const createDiffFile = useCallback((diff: Diff) => {
    const oldFileName = diff.oldFile?.fileName || 'old';
    const newFileName = diff.newFile?.fileName || 'new';
    const oldContent = diff.oldFile?.content || '';
    const newContent = diff.newFile?.content || '';

    try {
      const instance = generateDiffFile(
        oldFileName,
        oldContent,
        newFileName,
        newContent,
        getHighLightLanguageFromPath(oldFileName) || 'plaintext',
        getHighLightLanguageFromPath(newFileName) || 'plaintext'
      );
      instance.initRaw();
      return instance;
    } catch (error) {
      console.error('Failed to parse diff:', error);
      return null;
    }
  }, []);

  const diffFiles = useMemo(() => {
    return diffs
      .map((diff) => createDiffFile(diff))
      .filter((diffFile) => diffFile !== null);
  }, [diffs, createDiffFile]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 m-4">
        <div className="text-red-800 text-sm">Failed to load diff: {error}</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader />
      </div>
    );
  }

  if (diffFiles.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm font-medium">No file changes</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto px-4">
        {diffFiles.map((diffFile, idx) => (
          <DiffCard key={idx} diffFile={diffFile} />
        ))}
      </div>
    </div>
  );
}

export default DiffTab;
