import React from 'react';
import { Clock, AlertTriangle, FileX, ArrowLeft, UploadCloud, WifiOff, RotateCw } from 'lucide-react';

interface ExpiredNoticeProps {
  reason: 'expired' | 'download_limit' | 'not_found' | 'unpublished' | 'network_error';
  onGoHome: () => void;
  onRetry?: () => void;
}

export const ExpiredNotice: React.FC<ExpiredNoticeProps> = ({ reason, onGoHome, onRetry }) => {
  const getDetails = () => {
    switch (reason) {
      case 'network_error':
        return {
          icon: <WifiOff className="w-8 h-8 text-amber-600" />,
          bgColor: 'bg-amber-50',
          borderColor: 'border-amber-200/60',
          title: 'Connection Lost or Changed',
          desc: 'Your internet connection changed or was interrupted. Check your network or click retry to load the document.',
        };
      case 'expired':
        return {
          icon: <Clock className="w-8 h-8 text-amber-600" />,
          bgColor: 'bg-amber-50',
          borderColor: 'border-amber-200/60',
          title: 'Link Has Expired',
          desc: 'The temporary sharing link for this document has reached its expiration date and is no longer accessible.',
        };
      case 'download_limit':
        return {
          icon: <AlertTriangle className="w-8 h-8 text-orange-600" />,
          bgColor: 'bg-orange-50',
          borderColor: 'border-orange-200/60',
          title: 'Download Limit Reached',
          desc: 'This document has reached the maximum allowed number of downloads set by the sender.',
        };
      case 'unpublished':
        return {
          icon: <FileX className="w-8 h-8 text-stone-600" />,
          bgColor: 'bg-stone-100',
          borderColor: 'border-stone-200',
          title: 'Document Unpublished',
          desc: 'The owner of this file has unpublished or deactivated this link.',
        };
      default:
        return {
          icon: <FileX className="w-8 h-8 text-red-600" />,
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200/60',
          title: 'Document Not Found',
          desc: 'We could not find a document associated with this link. If the publisher’s computer was recently off or the cloud server is waking up after being idle, click Retry below to re-query the cloud storage.',
        };
    }
  };

  const info = getDetails();

  return (
    <div className="max-w-md mx-auto my-16 p-8 bg-white border border-stone-200/80 rounded-2xl shadow-sm text-center">
      <div className={`w-16 h-16 ${info.bgColor} border ${info.borderColor} rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-2xs`}>
        {info.icon}
      </div>

      <h2 className="text-xl font-bold text-stone-900 mb-2">{info.title}</h2>
      <p className="text-sm text-stone-600 mb-8 leading-relaxed">
        {info.desc}
      </p>

      <div className="space-y-3">
        {onRetry && (
          <button
            onClick={onRetry}
            className="w-full flex items-center justify-center space-x-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-all shadow-xs"
          >
            <RotateCw className="w-4 h-4" />
            <span>Retry Reconnecting</span>
          </button>
        )}

        <button
          onClick={onGoHome}
          className={`w-full flex items-center justify-center space-x-2 py-3 px-4 ${onRetry ? 'bg-stone-100 hover:bg-stone-200 text-stone-800' : 'bg-indigo-600 hover:bg-indigo-700 text-white'} rounded-xl font-semibold text-sm transition-all shadow-xs`}
        >
          <UploadCloud className="w-4 h-4" />
          <span>Upload Your Own Document</span>
        </button>

        <button
          onClick={onGoHome}
          className="w-full flex items-center justify-center space-x-1.5 py-2.5 px-4 bg-transparent hover:bg-stone-100 text-stone-600 rounded-xl font-medium text-xs transition-all"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to MakeTransfer Home</span>
        </button>
      </div>
    </div>
  );
};
